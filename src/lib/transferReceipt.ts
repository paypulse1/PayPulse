import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export type TransferReceiptData = {
  amount: number;
  status: string;
  reference: string;
  channel: string;
  institutionName: string;
  recipientName?: string;
  accountNumber?: string;
  remarks?: string;
  createdAt: string;
};

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function receiptFileName(reference: string) {
  const safeReference = reference.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `drpay-transfer-${safeReference || "receipt"}.png`;
}

async function shareReceiptBlob(blob: Blob, fileName: string) {
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: fileName,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    await Share.share({
      title: "DRPAY transfer receipt",
      files: [file.uri],
      dialogTitle: "Save or share transfer receipt",
    });
    return;
  }

  const image = new File([blob], fileName, { type: "image/png" });
  if (!navigator.canShare?.({ files: [image] }) || !navigator.share) {
    throw new Error("Image sharing is not supported in this browser.");
  }
  await navigator.share({ title: "DRPAY transfer receipt", files: [image] });
}

export async function createTransferReceiptImage(receipt: TransferReceiptData) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the transfer receipt image.");

  const rows: [string, string][] = [
    ["Status", receipt.status],
    ["Reference", receipt.reference],
  ];
  if (receipt.recipientName) rows.push(["Recipient", receipt.recipientName]);
  rows.push(["Institution", receipt.institutionName]);
  if (receipt.accountNumber) rows.push(["Account", `Ending ${receipt.accountNumber.slice(-4)}`]);
  rows.push(["Network", receipt.channel]);
  if (receipt.remarks) rows.push(["Remarks", receipt.remarks]);
  const transferDate = new Date(receipt.createdAt);
  rows.push(["Date", Number.isNaN(transferDate.getTime()) ? receipt.createdAt : transferDate.toLocaleString()]);
  const rowLayouts = rows.map(([label, value]) => {
    context.font = "600 25px Arial, sans-serif";
    const lines = wrapText(context, value, 800);
    return { label, lines, height: 32 + lines.length * 34 };
  });
  const contentHeight = rowLayouts.reduce((total, row) => total + row.height, 0);
  canvas.height = 450 + contentHeight;

  const drawContext = canvas.getContext("2d");
  if (!drawContext) throw new Error("Could not draw the transfer receipt image.");
  drawContext.fillStyle = "#e9eef5";
  drawContext.fillRect(0, 0, canvas.width, canvas.height);
  drawContext.fillStyle = "#ffffff";
  drawContext.fillRect(32, 32, 896, canvas.height - 64);
  drawContext.fillStyle = "#0b1f3a";
  drawContext.fillRect(32, 32, 896, 116);
  drawContext.fillStyle = "#ffffff";
  drawContext.font = "800 24px Arial, sans-serif";
  drawContext.fillText("DRPAY", 72, 78);
  drawContext.fillStyle = "#c6d3e2";
  drawContext.font = "600 16px Arial, sans-serif";
  drawContext.fillText("TRANSFER RECEIPT", 72, 112);

  drawContext.fillStyle = "#52647c";
  drawContext.font = "600 18px Arial, sans-serif";
  drawContext.fillText("TRANSFER AMOUNT", 72, 198);
  drawContext.fillStyle = "#0b1f3a";
  drawContext.font = "800 46px Arial, sans-serif";
  drawContext.fillText(`PHP ${receipt.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 72, 258);
  drawContext.strokeStyle = "#d8e1ed";
  drawContext.lineWidth = 2;
  drawContext.beginPath();
  drawContext.moveTo(72, 298);
  drawContext.lineTo(888, 298);
  drawContext.stroke();

  let y = 344;
  for (const row of rowLayouts) {
    drawContext.fillStyle = "#52647c";
    drawContext.font = "700 15px Arial, sans-serif";
    drawContext.fillText(row.label.toUpperCase(), 72, y);
    drawContext.fillStyle = "#0b1f3a";
    drawContext.font = "600 25px Arial, sans-serif";
    row.lines.forEach((line, index) => drawContext.fillText(line, 72, y + 34 + index * 34));
    y += row.height;
    drawContext.strokeStyle = "#e6ebf2";
    drawContext.beginPath();
    drawContext.moveTo(72, y - 8);
    drawContext.lineTo(888, y - 8);
    drawContext.stroke();
  }

  drawContext.fillStyle = "#52647c";
  drawContext.font = "500 15px Arial, sans-serif";
  drawContext.fillText("Provider-reported status. A pending transfer is not proof of settlement.", 72, canvas.height - 65);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not generate the transfer receipt image."));
    }, "image/png");
  });
}

export async function downloadTransferReceiptImage(receipt: TransferReceiptData) {
  const blob = await createTransferReceiptImage(receipt);
  const fileName = receiptFileName(receipt.reference);
  if (Capacitor.isNativePlatform()) {
    await shareReceiptBlob(blob, fileName);
    return;
  }

  const imageUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = imageUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not prepare the receipt image for sharing."));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Could not prepare the receipt image for sharing."));
        return;
      }
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function shareTransferReceiptImage(receipt: TransferReceiptData) {
  const blob = await createTransferReceiptImage(receipt);
  const fileName = receiptFileName(receipt.reference);
  await shareReceiptBlob(blob, fileName);
}
