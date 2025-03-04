import base64url from "base64url";
import { arraybufferEqual, byteArrayToLong } from "./utils";
import DataItem from "./DataItem";
import Transaction  from "arweave/node/lib/transaction";
import Arweave from "arweave";
import { BundleInterface } from './BundleInterface';
import { JWKInterface } from './interface-jwk';

const HEADER_START = 32;

export default class Bundle implements BundleInterface {
  readonly binary: Buffer;

  constructor(binary: Buffer, verify = false) {
    // TODO: Add some verification
    if (verify) {
      if (!Bundle._verify(binary)) throw new Error("Binary not valid bundle");
    }

    this.binary = binary;
  }

  public get length(): number { return this.getDataItemCount(); }

  get items(): DataItem[] {
    const items = new Array(this.length);
    let offset = 0;
    const bundleStart = this.getBundleStart();

    let counter = 0;
    for (let i = HEADER_START; i < (HEADER_START + (64 * this.length)); i+=64) {
      const _offset = byteArrayToLong(this.binary.subarray(i, i + 32))
      const _id = this.binary.subarray(i + 32, i + 64);

      const dataItemStart = bundleStart + offset;
      const bytes = this.binary.subarray(dataItemStart, dataItemStart + _offset);

      offset += _offset;

      const item = new DataItem(bytes);
      item.rawId = _id;
      items[counter] = item;

      counter++;
    }
    return items;
  }

  public getRaw(): Buffer {
    return this.binary;
  }

  /**
   * Get a DataItem by index (`number`) or by txId (`string`)
   * @param index
   */
  public get(index: number | string): DataItem {
    if (typeof index === "number") {
      if (index >= this.length) {
        throw new RangeError("Index out of range");
      }

      return this.getByIndex(index);
    } else {
      return this.getById(index);
    }
  }

  public getIds(): string[] {
    const ids = [];
    for (let i = HEADER_START; i < (HEADER_START + (64 * this.length)); i+=64) {
      ids.push(base64url.encode(this.binary.subarray(i + 32, i + 64)))
    }

    return ids;
  }

  public getIdBy(index: number): string {
    if (index > this.length - 1) {
      throw new RangeError("Index of bundle out of range");
    }

    const start = 64 + (64 * index);
    return base64url.encode(this.binary.subarray(start, start + 32));
  }

  public async toTransaction(arweave: Arweave, jwk: JWKInterface): Promise<Transaction> {
    const tx = await arweave.createTransaction({
      data: this.binary
    }, jwk);
    tx.addTag("Bundle-Format", "binary");
    tx.addTag("Bundle-Version", "2.0.0");
    return tx;
  }

  public verify(): boolean {
    return Bundle._verify(this.binary);
  }

  private static _verify(binary: Buffer): boolean {
    const length = byteArrayToLong(binary.subarray(0, 32));
    let offset = 32 + (64 * length);
    for (let i = HEADER_START; i < (HEADER_START + (64 * length)); i+=64) {
      const _offset = byteArrayToLong(binary.subarray(i, i + 32));

      const item = new DataItem(binary.subarray(offset, offset + _offset));
      if (!item.isValid()) {
        return false;
      }

      offset += _offset;
    }

    return true;
  }

  private getOffset(id: Uint8Array): { startOffset: number, size: number } {
    let offset = 0;
    for (let i = HEADER_START; i < (HEADER_START + (64 * this.length)); i+=64) {
      const _offset = byteArrayToLong(this.binary.subarray(i, i + 32))
      offset += _offset;
      const _id = this.binary.subarray(i + 32, i + 64);


      if (arraybufferEqual(_id, id)) {
        return { startOffset: offset, size: _offset };
      }
    }

    return { startOffset: -1, size: -1 };
  }

  // TODO: Test this
  /**
   * UNSAFE! Assumes index < length
   * @param index
   * @private
   */
  private getByIndex(index: number) {
    let offset = 0;

    const headerStart = 32 + (64 * index);
    const dataItemSize = byteArrayToLong(this.binary.subarray(headerStart, headerStart + 32))

    let counter = 0;
    for (let i = HEADER_START; i < (HEADER_START + (64 * this.length)); i+=64) {
      if (counter == index) {
        break;
      }

      const _offset = byteArrayToLong(this.binary.subarray(i, i + 32));
      offset += _offset;

      counter++;
    }


    const bundleStart = this.getBundleStart();
    const dataItemStart = bundleStart + offset;
    const slice = this.binary.subarray(dataItemStart, dataItemStart + dataItemSize);
    return new DataItem(slice);
  }

  private getById(id: string): DataItem {
    const _id = base64url.toBuffer(id);

    const offset = this.getOffset(_id);
    if (offset.startOffset === -1) {
      throw new Error("Transaction not found");
    }

    const bundleStart = this.getBundleStart();
    const dataItemStart = bundleStart + offset.startOffset;
    return new DataItem(this.binary.subarray(dataItemStart, dataItemStart + offset.size))
  }

  private getDataItemCount(): number {
    return byteArrayToLong(this.binary.subarray(0, 32));
  }

  private getBundleStart(): number {
    return 32 + (64 * this.length);
  }
}
