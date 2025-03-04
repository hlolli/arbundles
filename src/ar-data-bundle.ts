import { DataItemCreateOptions, getSignatureData } from './ar-data-base';
import { createData } from './ar-data-create';
import { longTo32ByteArray } from './utils';
import DataItem from './DataItem';
import Arweave from 'arweave';
import Bundle from './Bundle';
import { Buffer } from 'buffer';
import { Signer } from './signing/Signer';


/**
 * Unbundles a transaction into an Array of DataItems.
 *
 * Takes either a json string or object. Will throw if given an invalid json
 * string but otherwise, it will return an empty array if
 *
 * a) the json object is the wrong format
 * b) the object contains no valid DataItems.
 *
 * It will verify all DataItems and discard ones that don't pass verification.
 *
 * @param txData
 */
export function unbundleData(
  txData: Buffer,
): Bundle {
  return new Bundle(txData);
}

/**
 * Verifies all data items and returns a json object with an items array.
 * Throws if any of the data items fail verification.
 *
 * @param dataItems
 * @param jwk
 */
export async function bundleAndSignData(dataItems: (DataItemCreateOptions | DataItem)[], signer: Signer): Promise<Bundle> {
  const headers = new Uint8Array(64 * dataItems.length);

  const binaries = await Promise.all(dataItems.map(async (di, index) => {
    // Create DataItem
    const d = DataItem.isDataItem(di) ? di as DataItem : await createData(di as DataItemCreateOptions, signer);
    // Sign DataItem
    const id = d.isSigned() ? d.rawId : await sign(d, signer);
    // Create header array
    const header = new Uint8Array(64);
    // Set offset
    header.set(longTo32ByteArray(d.getRaw().byteLength), 0);
    // Set id
    header.set(id, 32);
    // Add header to array of headers
    headers.set(header, 64 * index);
    // Convert to array for flattening
    const raw = d.getRaw();
    return Array.from(raw);
  })).then(a => {
    return a.flat();
  });

  const buffer = Buffer.from([...longTo32ByteArray(dataItems.length), ...headers, ...binaries]);

  return new Bundle(buffer);
}

/**
 * Signs a single
 *
 * @param item
 * @param signer
 * @returns signings - signature and id in byte-arrays
 */
export async function getSignatureAndId(item: DataItem, signer: Signer): Promise<{ signature: Buffer, id: Buffer }> {
  const signatureData = await getSignatureData(item);
  const signatureBytes = await signer.sign(signatureData)
  const idBytes = await Arweave.crypto.hash(signatureBytes);

  return { signature: Buffer.from(signatureBytes), id: Buffer.from(idBytes) };
}

/**
 * Signs and returns item id
 *
 * @param item
 * @param jwk
 */
export async function sign(item: DataItem, signer: Signer): Promise<Buffer> {
  const { signature, id } = await getSignatureAndId(item, signer);
  item.getRaw().set(signature, 2);
  return id;
}
