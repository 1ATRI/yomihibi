import DynamicDictionaries from 'kuromoji/src/dict/DynamicDictionaries.js';
import Tokenizer from 'kuromoji/src/Tokenizer.js';
import { gunzipSync } from 'fflate';
import { normalizeToken } from './shared/japanese.js';

let pending;
export async function loadTokenizer(readFile = async name => {
  const response = await fetch(chrome.runtime.getURL(`dict/${name}.dat.gz`));
  if (!response.ok) throw new Error('离线词典加载失败，请重新加载插件');
  return new Uint8Array(await response.arrayBuffer());
}) {
  const names = ['base', 'check', 'tid', 'tid_pos', 'tid_map', 'cc', 'unk', 'unk_pos', 'unk_map', 'unk_char', 'unk_compat', 'unk_invoke'];
  const arrays = await Promise.all(names.map(async name => gunzipSync(await readFile(name))));
  const b = Object.fromEntries(names.map((name, i) => [name, arrays[i]]));
  const as = (Type, bytes) => new Type(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const dic = new DynamicDictionaries();
  dic.loadTrie(as(Int32Array, b.base), as(Int32Array, b.check));
  dic.loadTokenInfoDictionaries(b.tid, b.tid_pos, b.tid_map);
  dic.loadConnectionCosts(as(Int16Array, b.cc));
  dic.loadUnknownDictionaries(b.unk, b.unk_pos, b.unk_map, b.unk_char, as(Uint32Array, b.unk_compat), b.unk_invoke);
  return new Tokenizer(dic);
}
export async function tokenizeTexts(texts) {
  pending ||= loadTokenizer().catch(error => { pending = null; throw error; });
  const tokenizer = await pending;
  return texts.map(text => tokenizer.tokenize(text).map(normalizeToken));
}
