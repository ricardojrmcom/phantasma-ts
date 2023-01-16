import BigInteger from "big-integer";
import { VMType } from "./VMType";
import { Timestamp } from "../types/Timestamp";
import { Address, PBinaryReader, PBinaryWriter, Serialization } from "../types";
import { ISerializable } from "../interfaces";
import { uint8ArrayToBytes } from "../utils";
import { Type } from "typescript";

export class VMObject implements ISerializable {
  public Type: VMType;
  public Data: object | null | undefined;
  public get IsEmpty(): boolean {
    return this.Data == null || this.Data == undefined;
  }
  private _localSize = 0;
  private static readonly TimeFormat: string = "MM/dd/yyyy HH:mm:ss";

  public GetChildren(): Map<VMObject, VMObject> | null {
    return this.Type == VMType.Struct
      ? (this.Data as Map<VMObject, VMObject>)
      : null;
  }

  public get Size(): number {
    let total = 0;

    if (this.Type == VMType.Object) {
      const children = this.GetChildren();
      let values = children?.values;
      for (let entry in values) {
        total += entry.length;
      }
    } else {
      total = this._localSize;
    }

    return total;
  }

  constructor() {
    this.Type = VMType.None;
    this.Data = null;
  }

  public AsTimestamp(): Timestamp {
    if (this.Type != VMType.Timestamp) {
      throw new Error(`Invalid cast: expected timestamp, got ${this.Type}`);
    }

    return this.Data as Timestamp;
  }

  public AsByteArray(): Uint8Array {
    switch (this.Type) {
      case VMType.Bytes:
        return new Uint8Array(this.Data as ArrayBuffer);
      case VMType.Bool:
        return new Uint8Array([(this.Data as unknown as boolean) ? 1 : 0]);
      case VMType.String:
        return new TextEncoder().encode(this.AsString() as string);
      case VMType.Number:
      // Here you will have to convert BigInteger to Uint8Array manually
      case VMType.Enum:
        var num = this.AsNumber() as unknown as number;
        var bytes = new Uint8Array(new ArrayBuffer(4));
        new DataView(bytes.buffer).setUint32(0, num);
        return bytes;
      case VMType.Timestamp:
        var time = this.AsTimestamp();
        var bytes = new Uint8Array(new ArrayBuffer(4));
        new DataView(bytes.buffer).setUint32(0, time.value);
        return bytes;
      case VMType.Struct:
      // Here you will have to convert struct to Uint8Array manually
      case VMType.Object:
      // here you will have to convert ISerializable to Uint8Array manually
      default:
        throw new Error(`Invalid cast: expected bytes, got ${this.Type}`);
    }
  }

  public AsString(): string {
    switch (this.Type) {
      case VMType.String:
        return this.Data?.toString() as string;
      case VMType.Number:
        return (this.Data as BigInteger).toString();
      case VMType.Bytes:
        return new TextDecoder().decode(this.Data as Uint8Array);
      case VMType.Enum:
        return (this.Data as unknown as number).toString();
      case VMType.Object:
        if (this.Data instanceof Address) {
          return this.Data.Text;
        }
        /*if (this.Data instanceof Hash) {
              return this.Data.toString();
          }*/
        return "Interop:" + this.Data?.constructor.name;
      case VMType.Struct:
        const arrayType = this.GetArrayType();
        if (arrayType === VMType.Number) {
          // convert array of unicode numbers into a string
          const children = this.GetChildren();
          let sb = "";

          for (let i = 0; i < children!.size; i++) {
            const key = VMObject.FromObject(i);
            const val = children?.get(key);

            const ch = String.fromCharCode(
              val!.AsNumber() as unknown as number
            );
            sb += ch;
          }

          return sb;
        } else {
          /*const buffer = new ArrayBuffer(this.Data?.length as number);
              const view = new DataView(buffer);
              this.SerializeData(view);
              return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));*/
        }
      case VMType.Bool:
        return this.Data ? "true" : "false";
      case VMType.Timestamp:
        return (this.Data as Timestamp).value.toString();
      default:
        throw new Error(`Invalid cast: expected string, got ${this.Type}`);
    }
  }

  public ToString(): string {
    switch (this.Type) {
      case VMType.String:
        return this.Data as unknown as string;
      case VMType.Number:
        return (this.Data as BigInteger).toString();
      case VMType.Bytes:
        return new TextDecoder().decode(this.Data as Uint8Array);
      case VMType.Enum:
        return (this.Data as unknown as number).toString();
      case VMType.Object:
        if (this.Data instanceof Address) {
          return this.Data.Text;
        }
        /*if (this.Data instanceof Hash) {
              return this.Data.toString();
          }*/
        return "Interop:" + (this.Data as object).constructor.name;
      case VMType.Struct:
        const arrayType = this.GetArrayType();
        if (arrayType === VMType.Number) {
          // convert array of unicode numbers into a string
          const children = this.GetChildren();
          let sb = "";
          for (let i = 0; i < children!.size; i++) {
            const key = VMObject.FromObject(i);
            const val = children!.get(key);
            const ch = String.fromCharCode(
              val!.AsNumber() as unknown as number
            );
            sb += ch;
          }
          return sb;
        } else {
          /*const stream = new PMemoryStream();
              const writer = new PBinaryWriter(stream);
              this.SerializeData(writer);
              return new TextDecoder().decode(stream.toArray());*/
        }
      case VMType.Bool:
        return this.Data ? "true" : "false";
      case VMType.Timestamp:
        return (this.Data as Timestamp).value.toString();
      default:
        throw new Error(`Invalid cast: expected string, got ${this.Type}`);
    }
  }

  public AsNumber(): BigInt {
    if (
      (this.Type === VMType.Object || this.Type === VMType.Timestamp) &&
      this.Data instanceof Timestamp
    ) {
      return (this.Data as Timestamp).value as unknown as BigInt;
    }

    switch (this.Type) {
      case VMType.String: {
        let number: BigInt = BigInt(this.Data as unknown as string);
        if (number.toString() === (this.Data as unknown as string)) {
          return number;
        } else {
          throw new Error(
            `Cannot convert String '${this.Data}' to BigInteger.`
          );
        }
      }

      case VMType.Bytes: {
        const bytes = new Uint8Array(this.Data as ArrayBuffer);
        const num = BigInt(`0x${bytes.join("")}`);
        return num;
      }

      case VMType.Enum: {
        const num = Number(this.Data);
        return BigInt(num);
      }

      case VMType.Bool: {
        const val = this.Data as unknown as boolean;
        return val ? BigInt(1) : BigInt(0);
      }

      default: {
        if (this.Type !== VMType.Number) {
          throw new Error(`Invalid cast: expected number, got ${this.Type}`);
        }

        return this.Data as BigInt;
      }
    }
  }

  public AsEnum<T extends any>(): T {
    if (!VMObject.isEnum(this.Data as any)) {
      throw new Error("T must be an enumerated type");
    }

    if (this.Type !== VMType.Enum) {
      this.Data = new Number(this.AsNumber());
    }

    return this.Data as any as T;
  }

  public GetArrayType(): VMType {
    if (this.Type !== VMType.Struct) {
      return VMType.None;
    }

    const children = this.GetChildren();

    let result: VMType = VMType.None;

    for (let i = 0; i < children!.size; i++) {
      const key = VMObject.FromObject(i);

      if (!children!.has(key)) {
        return VMType.None;
      }

      const val = children!.get(key);

      if (result === VMType.None) {
        result = val!.Type;
      } else if (val!.Type !== result) {
        return VMType.None;
      }
    }

    return result;
  }

  /*
    public AsType(type: VMType): object {
        switch (type) {
            case VMType.Bool:
            return this.AsBool();
            case VMType.String:
            return this.AsString();
            case VMType.Bytes:
            return this.AsByteArray();
            case VMType.Number:
            return this.AsNumber();
            case VMType.Timestamp:
            return this.AsTimestamp();
            default:
            throw ("Unsupported VM cast");
        }
    }*/

  static isEnum(instance: any): boolean {
    if (instance == null) return false;
    let keys = Object.keys(instance);
    let values: any[] = [];

    for (let key of keys) {
      let value = instance[key];

      if (typeof value === "number") {
        value = value.toString();
      }

      values.push(value);
    }

    for (let key of keys) {
      if (values.indexOf(key) < 0) {
        return false;
      }
    }

    return true;
  }

  /*public AsEnum<T>(): T {
        if (isEnum(this.Data)) {
            throw new ArgumentException("T must be an enumerated type");
        }
        if (this.Type != VMType.Enum) {
            const num = this.AsNumber();
            this.Data = Number(this.Data);
          }
          
          return (T) Enum.Parse(typeof T, this.Data.toString());
    }*/

  public AsBool(): boolean {
    switch (this.Type) {
      case VMType.String:
        return (this.Data as unknown as string).toLowerCase() == "true";
      case VMType.Number:
        return (this.Data as BigInt) != BigInt(0);
      case VMType.Bool:
        return (this.Data as unknown as boolean) ? true : false;
      default:
        throw new Error(`Invalid cast: expected bool, got ${this.Type}`);
    }
  }

  public static isStructOrClass(type: Type): boolean {
    /*if (type == ) {
      console.log("isStructOrClass: String");
      return false;
    }*/
    return (
      (!VMObject.isPrimitive(type) &&
        VMObject.isValueType(type) &&
        !VMObject.isEnum(type)) ||
      VMObject.isClass(type) ||
      VMObject.isInterface(type)
    );
  }

  public static isSerializable(type: any): boolean {
    return (
      type instanceof ISerializable ||
      VMObject.isPrimitive(type) ||
      VMObject.isStructOrClass(type) ||
      VMObject.isEnum(type)
    );
  }

  public static isPrimitive(type: any): boolean {
    return (
      type === String || type === Number || type === Boolean || type === BigInt
    );
  }

  public static isValueType(type: any): boolean {
    return type === Object;
  }

  public static isClass(type: any): boolean {
    return (
      type === Array ||
      type === Map ||
      type === Set ||
      type instanceof Object ||
      (typeof type).toLowerCase() === "object"
    );
  }

  public static isInterface(type: any): boolean {
    return type === Map;
  }

  public ToStruct(structType: any): any {
    if (this.Type !== VMType.Struct) {
      throw new Error("not a valid source struct");
    }
    if (!VMObject.isStructOrClass(structType)) {
      throw new Error("not a valid destination struct");
    }

    let localType = Object.apply(typeof structType);
    const dict = this.GetChildren();
    const result = new structType();
    const fields = Object.keys(result);
    console.log("Fields:", fields);
    for (const field of fields) {
      const key = VMObject.FromObject(field);
      console.log(
        "Key:",
        key,
        "Field:",
        field,
        "Type:",
        typeof structType[field],
        ""
      );
      let val;
      console.log("Does it has? ", dict.hasOwnProperty(key));
      if (dict.hasOwnProperty(key)) {
        val = dict[key].toObject(structType[field]);
      } else {
        console.log(`field not present in source struct: ${field}`);
        if (!VMObject.isStructOrClass(structType[field])) {
          //throw new Error(`field not present in source struct: ${field}`);
        }
        //val = null;
      }

      console.log(structType[field]);
      /*if (val !== null && localType[field] !== "Uint8Array") {
        if (VMObject.isSerializable(localType[field])) {
          const temp = new structType[field]();
          const stream = new Uint8Array(val);
          const reader = new PBinaryReader(stream);
          (temp as ISerializable).UnserializeData(reader);
          val = temp;
        }
      }*/
      console.log(" Value is ", val);

      if (VMObject.isEnum(typeof structType[field]) && !VMObject.isEnum(val)) {
        val = localType[field][val?.toString()];
      }
      result[field] = val;
    }
    return result;
  }

  public static GetVMType(type: any): any {
    if (VMObject.isEnum(type)) {
      return VMType.Enum;
    }
    if (type === Boolean || type.toLowerCase() === "boolean") {
      return VMType.Bool;
    }
    if (
      typeof type == typeof String ||
      type === String ||
      type.toLowerCase() === "string"
    ) {
      return VMType.String;
    }
    if (type === "Uint8Array") {
      return VMType.Bytes;
    }
    if (
      type === "BigInt" ||
      type === Number ||
      type === BigInt ||
      type.toLowerCase() === "number"
    ) {
      return VMType.Number;
    }
    if (type === Timestamp || type === Number) {
      return VMType.Timestamp;
    }
    if (VMObject.isEnum(type)) {
      return VMType.Enum;
    }
    if (VMObject.isClass(type) || VMObject.isValueType(type)) {
      return VMType.Object;
    }
    return VMType.Struct;
  }

  public static IsVMType(type: any): boolean {
    const result = VMObject.GetVMType(type);
    return result !== VMType.None;
  }

  public SetValue(value: any): VMObject {
    this.Data = value;
    return this;
  }

  public setValue(val: any, type: VMType) {
    this.Type = type;
    this._localSize = val != null ? val.length : 0;

    switch (type) {
      case VMType.Bytes:
        this.Data = val;
        break;
      case VMType.Number:
        this.Data = val == null ? BigInt(0) : val;
        break;
      case VMType.String:
        this.Data = new String(val);
        break;
      case VMType.Enum:
        this.Data = val.slice(0, 4);
        break;
      case VMType.Timestamp:
        this.Data = new Timestamp(val.slice(0, 4));
        break;
      case VMType.Bool:
        this.Data = new Boolean(val[0] === 1);
        break;
      default:
        if (val instanceof Uint8Array) {
          const len = val.length;
          switch (len) {
            case Address.LengthInBytes:
              this.Data = Address.FromBytes(val);
              break;
            /*case Hash.Length:
                        this.Data = Hash.fromBytes(val);
                        break;*/
            /*default:
                        try {
                            this.unserializeData(val);
                        } catch (e) {
                            throw new Error("Cannot decode interop object from bytes with length: " + len);
                        }
                        break;*/
          }
          break;
        } else {
          throw new Error("Cannot set value for vmtype: " + type);
        }
    }
  }

  public static ValidateStructKey(key: VMObject) {
    if (
      key.Type == VMType.None ||
      key.Type == VMType.Struct ||
      key.Type == VMType.Object
    ) {
      throw new Error(
        `Cannot use value of type ${key.Type} as key for struct field`
      );
    }
  }

  public CastViaReflection(
    srcObj: any,
    level: number,
    dontConvertSerializables: boolean = true
  ): any {
    const srcType = srcObj.constructor.name;
    if (Array.isArray(srcObj)) {
      const children = new Map<any, any>();
      const array = srcObj;
      for (let i = 0; i < array.length; i++) {
        const val = array[i];
        const key = new VMObject();
        key.SetValue(i);
        const vmVal = this.CastViaReflection(val, level + 1);
        children.set(key, vmVal);
      }
      const result = new VMObject();
      result.SetValue(children);
      return result;
    } else {
      const targetType = VMObject.GetVMType(srcType);

      let result: any;
      let isKnownType =
        srcType === VMType.Number || srcType === VMType.Timestamp;

      let localType = Object.apply(typeof srcType);

      if (
        !isKnownType &&
        dontConvertSerializables &&
        VMObject.isSerializable(localType)
      ) {
        isKnownType = true;
      }

      if (VMObject.isStructOrClass(localType) && !isKnownType) {
        const children = new Map<any, any>();
        const fields = Object.keys(srcObj as typeof srcType);
        console.log("fields", fields);
        if (fields.length > 0) {
          fields.forEach((field: any) => {
            const key = VMObject.FromObject(field);
            console.log(key);
            VMObject.ValidateStructKey(key);
            const val = srcObj[field];
            const vmVal = this.CastViaReflection(val, level + 1, true);
            children.set(key, vmVal);
          });
          result = new VMObject();
          result.SetValue(children);
          result.Type = VMType.Struct;
          console.log(" My local result = ", result);
          return result;
        }
      }

      result = VMObject.FromObject(srcObj);
      if (result != null) {
        return result;
      }
      throw new Error(`invalid cast: Interop.${srcType} to vm object`);
    }
  }

  SetKey(key: VMObject, obj: VMObject) {
    VMObject.ValidateStructKey(key);
    let children: Map<VMObject, VMObject> | null;
    const temp = new VMObject();
    temp.Copy(key);
    key = temp;

    if (this.Type == VMType.Struct) {
      children = this.GetChildren();
    } else if (this.Type == VMType.None) {
      this.Type = VMType.Struct;
      children = new Map();
      this.Data = children;
      this._localSize = 0;
    } else {
      throw new Error(`Invalid cast from ${this.Type} to struct`);
    }
    const result = new VMObject();
    children?.set(key, result);
    result.Copy(obj);
  }

  Copy(other: VMObject) {
    if (!other || other.Type == VMType.None) {
      this.Type = VMType.None;
      this.Data = null;
      return;
    }
    this.Type = other.Type;
    if (other.Type == VMType.Struct) {
      const children = new Map<VMObject, VMObject>();
      const otherChildren = other.GetChildren();
      otherChildren?.forEach((val: VMObject, key: VMObject) => {
        const temp = new VMObject();
        temp.Copy(val);
        children.set(key, temp);
      });
      this.Data = children;
    } else {
      this.Data = other.Data;
    }
  }

  public static FromArray(array: any[]) {
    const result = new VMObject();
    for (let i = 0; i < array.length; i++) {
      const key = VMObject.FromObject(i);
      const val = VMObject.FromObject(array[i]);
      result.SetKey(key, val);
    }
    return result;
  }

  static CastTo(srcObj: VMObject, type: VMType): VMObject {
    if (srcObj.Type == type) {
      let result = new VMObject();
      result.Copy(srcObj);
      return result;
    }

    switch (type) {
      case VMType.None:
        return new VMObject();

      case VMType.String: {
        let result = new VMObject();
        result.SetValue(srcObj.AsString());
        return result;
      }

      case VMType.Timestamp: {
        let result = new VMObject();
        result.SetValue(srcObj.AsTimestamp());
        return result;
      }

      case VMType.Bool: {
        let result = new VMObject();
        result.SetValue(srcObj.AsBool());
        return result;
      }

      case VMType.Bytes: {
        let result = new VMObject();
        result.SetValue(srcObj.AsByteArray());
        return result;
      }

      case VMType.Number: {
        let result = new VMObject();
        result.SetValue(srcObj.AsNumber());
        return result;
      }

      case VMType.Struct: {
        switch (srcObj.Type) {
          case VMType.Enum: {
            var result = new VMObject();
            result.SetValue(srcObj.AsEnum()); // TODO does this work for all types?
            return result;
          }
          case VMType.Object: {
            var result = new VMObject();
            result.SetValue(srcObj.CastViaReflection(srcObj.Data, 0)); // TODO does this work for all types?
            return result;
          }
          default:
            throw `invalid cast: ${srcObj.Type} to ${type}`;
        }
      }
      default:
        throw `invalid cast: ${srcObj.Type} to ${type}`;
    }
  }

  public static FromObject(obj: any): any {
    const objType = obj.constructor.name;
    const type = this.GetVMType(objType);
    if (type === VMType.None) {
      throw new Error("not a valid object");
    }

    const result = new VMObject();
    switch (type) {
      case VMType.Bool:
        result.setValue(obj, VMType.Bool);
        break;
      case VMType.Bytes:
        result.setValue(new Uint8Array(obj), VMType.Bytes);
        break;
      case VMType.String:
        result.setValue(obj, VMType.String);
        break;
      case VMType.Enum:
        result.setValue(obj, VMType.Enum);
        break;
      case VMType.Object:
        result.setValue(obj, VMType.Object);
        break;
      case VMType.Number:
        /*if (objType === Number) {
          obj = BigInt(obj);
        }*/
        result.setValue(obj, VMType.Number);
        break;
      case VMType.Timestamp:
        /*if (objType === "Number") {
          obj = new Timestamp(obj);
        }*/
        result.setValue(obj, VMType.Timestamp);
        break;
      case VMType.Struct:
        result.Type = VMType.Struct;

        if (Array.isArray(obj)) {
          return this.FromArray(obj);
        }
        break;
      default:
        return null;
    }
    return result;
  }

  public static FromStruct(obj: any): VMObject {
    let vm = new VMObject();
    return vm.CastViaReflection(obj, 0, false);
  }

  // Serialization
  public static FromBytes(bytes: any): VMObject {
    var result = new VMObject();
    result.UnserializeData(bytes);
    return result;
  }

  SerializeData(writer: PBinaryWriter) {
    writer.writeByte(this.Type);
    if (this.Type == VMType.None) {
      return;
    }

    let dataType = typeof this.Data;

    switch (this.Type) {
      case VMType.Struct: {
        let children = this.GetChildren();
        writer.writeVarInt(children.size);
        children.forEach((key, value) => {
          key.SerializeData(writer);
          value.SerializeData(writer);
        });
        break;
      }

      case VMType.Object: {
        var obj = this.Data as ISerializable;

        if (obj != null) {
          var bytes = Serialization.Serialize(obj);
          var uintBytes = uint8ArrayToBytes(bytes);
          writer.writeByteArray(uintBytes);
        } else {
          throw `Objects of type ${dataType} cannot be serialized`;
        }

        break;
      }

      case VMType.Enum: {
        let temp2: number = 0;

        if (this.Data instanceof Enumerator) {
          var temp1 = this.Data.item;
          temp2 = temp1 as unknown as number;
        } else {
          temp2 = this.Data as unknown as number;
        }

        writer.writeVarInt(temp2);
        break;
      }
      default:
        Serialization.SerializeObject(writer, this.Data, null);
        break;
    }
  }

  /*UnserializeData(reader: PBinaryReader) {
    this.Type = reader.readByte();
    if (this.Type == VMType.None) {
      return;
    }

    switch (this.Type) {
      case VMType.Struct: {
        let children = new Map<VMObject, VMObject>();
        let count = reader.readVarInt();
        for (let i = 0; i < count; i++) {
          let key = new VMObject();
          key.UnserializeData(reader);
          let value = new VMObject();
          value.UnserializeData(reader);
          children.set(key, value);
        }
        this.Data = children;
        break;
      }

      case VMType.Object: {
        var bytes = reader.readByteArray();
        var obj = Serialization.Unserialize(bytes);
        this.Data = obj as Object;
        break;
      }

      case VMType.Enum: {
        let temp = reader.readVarInt();
        this.Data = temp as unknown as Enumerator;
        break;
      }

      default:
        this.Data = Serialization.UnserializeObject(reader, null);
        break;
    }
  }*/

  UnserializeData(reader: PBinaryReader) {
    this.Type = reader.readByte() as VMType;
    switch (this.Type) {
      case VMType.Bool:
        this.Data = Serialization.Unserialize<Boolean>(reader);
        break;

      case VMType.Bytes:
        this.Data = Serialization.Unserialize<Uint8Array>(reader);
        break;

      case VMType.Number:
        this.Data = Serialization.Unserialize<BigInteger>(reader);
        break;

      case VMType.Timestamp:
        this.Data = Serialization.Unserialize<Timestamp>(reader);
        break;

      case VMType.String:
        this.Data = Serialization.Unserialize<String>(reader);
        break;

      case VMType.Struct:
        let childCount = reader.readVarInt();
        let children = new Map<VMObject, VMObject>();
        while (childCount > 0) {
          let key = new VMObject();
          key.UnserializeData(reader);

          VMObject.ValidateStructKey(key);

          let val = new VMObject();
          val.UnserializeData(reader);

          children.set(key, val);
          childCount--;
        }

        this.Data = children;
        break;

      case VMType.Object:
        let bytes = reader.readByteArray();

        if (bytes.length == 35) {
          let addr = Serialization.Unserialize<Address>(bytes);
          this.Data = addr;
          this.Type = VMType.Object;
        } else {
          this.Type = VMType.Bytes;
          this.Data = bytes;
        }

        break;

      case VMType.Enum:
        this.Type = VMType.Enum;
        this.Data = reader.readVarInt() as Number;
        break;

      case VMType.None:
        this.Type = VMType.None;
        this.Data = null;
        break;

      default:
        throw new Error(`invalid unserialize: type ${this.Type}`);
    }
  }
}
