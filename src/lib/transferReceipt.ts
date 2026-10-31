import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const receiptStyle = {
  ink: "#0b1f3a",
  slate: "#52647c",
  muted: "#c6d3e2",
  line: "#d8e1ed",
  paper: "#f5f7fb",
  white: "#ffffff",
  success: "#16724a",
  font: "Manrope, sans-serif",
};

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

type ReceiptRowLayout = {
  label: string;
  lines: string[];
  height: number;
};

const receiptCanvas = {
  width: 960,
  horizontalPadding: 72,
  contentWidth: 800,
  rowLineHeight: 34,
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

function formatTransferDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getReceiptRows(
  receipt: TransferReceiptData,
  context: CanvasRenderingContext2D,
): ReceiptRowLayout[] {
  const rows: [string, string][] = [
    ["Status", receipt.status],
    ["Reference", receipt.reference],
  ];
  if (receipt.recipientName) rows.push(["Recipient", receipt.recipientName]);
  rows.push(["Institution", receipt.institutionName]);
  if (receipt.accountNumber)
    rows.push(["Account", `Ending ${receipt.accountNumber.slice(-4)}`]);
  rows.push(["Network", receipt.channel]);
  if (receipt.remarks) rows.push(["Remarks", receipt.remarks]);
  rows.push(["Date", formatTransferDate(receipt.createdAt)]);

  context.font = `600 25px ${receiptStyle.font}`;
  return rows.map(([label, value]) => {
    const lines = wrapText(context, value, receiptCanvas.contentWidth);
    return {
      label,
      lines,
      height: 32 + lines.length * receiptCanvas.rowLineHeight,
    };
  });
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

function drawReceiptHeader(context: CanvasRenderingContext2D) {
  context.fillStyle = receiptStyle.ink;
  context.fillRect(32, 32, 896, 116);
  context.fillStyle = receiptStyle.success;
  context.fillRect(32, 32, 8, 116);
  context.fillStyle = receiptStyle.white;
  context.font = `800 24px ${receiptStyle.font}`;
  context.fillText("DRPAY", receiptCanvas.horizontalPadding, 78);
  context.fillStyle = receiptStyle.muted;
  context.font = `600 16px ${receiptStyle.font}`;
  context.fillText("TRANSFER RECEIPT", receiptCanvas.horizontalPadding, 112);
}

function drawReceiptAmount(
  context: CanvasRenderingContext2D,
  amount: number,
) {
  context.fillStyle = receiptStyle.slate;
  context.font = `600 18px ${receiptStyle.font}`;
  context.fillText("TRANSFER AMOUNT", receiptCanvas.horizontalPadding, 198);
  context.fillStyle = receiptStyle.ink;
  context.font = `800 46px ${receiptStyle.font}`;
  context.fillText(
    `PHP ${amount.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    receiptCanvas.horizontalPadding,
    258,
  );
  context.strokeStyle = receiptStyle.line;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(receiptCanvas.horizontalPadding, 298);
  context.lineTo(888, 298);
  context.stroke();
}

function drawReceiptRows(
  context: CanvasRenderingContext2D,
  rows: ReceiptRowLayout[],
  canvasHeight: number,
) {
  let y = 344;
  for (const row of rows) {
    context.fillStyle = receiptStyle.slate;
    context.font = `700 15px ${receiptStyle.font}`;
    context.fillText(row.label.toUpperCase(), receiptCanvas.horizontalPadding, y);
    context.fillStyle = receiptStyle.ink;
    context.font = `600 25px ${receiptStyle.font}`;
    row.lines.forEach((line, index) =>
      context.fillText(
        line,
        receiptCanvas.horizontalPadding,
        y + receiptCanvas.rowLineHeight * (index + 1),
      ),
    );
    y += row.height;
    context.strokeStyle = receiptStyle.line;
    context.beginPath();
    context.moveTo(receiptCanvas.horizontalPadding, y - 8);
    context.lineTo(888, y - 8);
    context.stroke();
  }

  context.fillStyle = receiptStyle.slate;
  context.font = `500 15px ${receiptStyle.font}`;
  context.fillText(
    "Provider-reported status. A pending transfer is not proof of settlement.",
    receiptCanvas.horizontalPadding,
    canvasHeight - 65,
  );
}

export async function createTransferReceiptImage(receipt: TransferReceiptData) {
  await document.fonts.load(`600 25px ${receiptStyle.font}`);
  const canvas = document.createElement("canvas");
  canvas.width = receiptCanvas.width;
  const measurementContext = canvas.getContext("2d");
  if (!measurementContext)
    throw new Error("Could not create the transfer receipt image.");

  const rows = getReceiptRows(receipt, measurementContext);
  canvas.height = 450 + rows.reduce((total, row) => total + row.height, 0);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the transfer receipt image.");
  context.fillStyle = receiptStyle.paper;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = receiptStyle.white;
  context.fillRect(32, 32, 896, canvas.height - 64);
  drawReceiptHeader(context);
  drawReceiptAmount(context, receipt.amount);
  drawReceiptRows(context, rows, canvas.height);

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
