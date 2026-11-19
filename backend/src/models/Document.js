const mongoose = require("mongoose");
// Versioned collection preserves the original prototype's records and unique indexes.
const schema = new mongoose.Schema({
  networkKey: { type: String, required: true },
  chainId: { type: Number, required: true }, contractAddress: { type: String, required: true },
  filename: { type: String, required: true, maxlength: 255 },
  cid: { type: String, required: true, maxlength: 128 },
  uploader: { type: String, required: true, lowercase: true },
  txHash: { type: String, required: true }, blockNumber: Number,
  ipfsUrl: String, fileSize: Number, mimeType: String,
  anchoredAt: { type: Date, required: true },
  gasUsed: String, gasPriceWei: String, feeWei: String, confirmationMs: Number, explorerUrl: String,
}, { timestamps: true, versionKey: false, bufferCommands: false, collection: "documents_v2" });
schema.index({ networkKey: 1, cid: 1 }, { unique: true });
schema.index({ networkKey: 1, anchoredAt: -1, cid: 1 });
schema.index({ networkKey: 1, uploader: 1, anchoredAt: -1 });
module.exports = mongoose.model("Document", schema);

