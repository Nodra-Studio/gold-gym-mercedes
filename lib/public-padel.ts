import { ClubError } from "@/lib/server";
export function publicOwner() {
  const owner = process.env.GOLD_GYM_OWNER_ID;
  if (!owner)
    throw new ClubError(
      "Las reservas online todavía no están habilitadas.",
      503,
    );
  return owner;
}
export function validateReceipt(receipt: string, type: string) {
  if (!receipt && !type) return;
  if (!receipt || !/^[A-Za-z0-9+/]+={0,2}$/.test(receipt))
    throw new ClubError("Comprobante inválido.");
  const bytes = Buffer.from(receipt, "base64");
  if (bytes.length > 1048576 || bytes.length < 8)
    throw new ClubError("El comprobante debe pesar hasta 1 MB.");
  const valid =
    type === "image/png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : type === "application/pdf" &&
          bytes.subarray(0, 5).toString() === "%PDF-";
  if (!valid) throw new ClubError("Usá una imagen JPG, PNG o un PDF válido.");
}
