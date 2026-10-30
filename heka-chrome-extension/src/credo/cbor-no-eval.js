import cbor from '../../node_modules/cbor-x/dist/index-no-eval.cjs'

export const Encoder = cbor.Encoder
export const Decoder = cbor.Decoder
export const encode = cbor.encode
export const decode = cbor.decode
export const addExtension = cbor.addExtension
export default cbor
