import crypto from "crypto";

function createSign(dataStr, time, appKey) {
  return crypto
    .createHash("md5")
    .update(dataStr + time + appKey)
    .digest("hex");
}

export async function createInvoice({
  orderId,
  buyerName,
  buyerEmail = "",
  buyerIdentifier = "0000000000",
  buyerTaxId = null,
  amount,
  productName,
  carrierType = "",
  carrierId = "",
  trackApiCode = "",
}) {
  const isBusiness = buyerTaxId && buyerTaxId !== "0000000000";

  // B2B 需要計算未稅金額和稅額
  const taxAmount = isBusiness ? Math.round((amount / 1.05) * 0.05) : 0;
  const salesAmount = isBusiness ? amount - taxAmount : amount;

  const data = {
    OrderId: orderId,
    ...(trackApiCode && { TrackApiCode: trackApiCode }),
    BuyerIdentifier: buyerTaxId || "0000000000",
    BuyerName: buyerName || "消費者",
    BuyerAddress: "",
    BuyerTelephoneNumber: "",
    BuyerEmailAddress: buyerEmail || "",
    MainRemark: "InRecord 線上課程",
    CarrierType: carrierType,
    CarrierId1: carrierId,
    CarrierId2: carrierId,
    NPOBAN: "",
    ProductItem: [
      {
        Description: productName || "零基礎流行鋼琴入門課",
        Quantity: "1",
        UnitPrice: String(amount),
        Amount: String(amount),
        Remark: "",
        TaxType: "1",
      },
    ],
    SalesAmount: String(salesAmount),
    FreeTaxSalesAmount: "0",
    ZeroTaxSalesAmount: "0",
    TaxType: "1",
    TaxRate: "0.05",
    TaxAmount: String(taxAmount),
    TotalAmount: String(amount),
    ...(isBusiness && { DetailVat: 1 }),
  };

  const dataStr = JSON.stringify(data);
  const time = Math.floor(Date.now() / 1000);
  const sign = createSign(dataStr, time, process.env.AMEGO_APP_KEY);

  const params = new URLSearchParams();
  params.append("invoice", process.env.AMEGO_IDENTIFIER);
  params.append("data", dataStr);
  params.append("time", String(time));
  params.append("sign", sign);

  try {
    const res = await fetch(`${process.env.AMEGO_API_URL}/json/f0401`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const result = await res.json();
    console.log("[Amego] 回傳結果:", result);

    if (result?.code === "0" || result?.code === 0) {
      return {
        success: true,
        // Amego 成功回傳的發票號碼在 invoice_number（msg 為空字串）
        invoiceNo: result.invoice_number || result.msg,
        invoiceTime: result.invoice_time,
        randomCode: result.random_number || result.random_code,
        barcode: result.barcode,
      };
    } else {
      console.error("[Amego] 開立失敗 code:", result?.code, result?.msg);
      return { success: false, error: result?.msg, code: result?.code };
    }
  } catch (err) {
    console.error("[Amego] API 錯誤:", err);
    return { success: false, error: err.message };
  }
}
