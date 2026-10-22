const institutionLogoAssets: Record<string, string> = {
  BDO: "/bank-logos/bdo.png",
  MAYA_WALLET: "/bank-logos/maya.png",
  BPI: "/bank-logos/bpi.png",
  BILLEASE: "/bank-logos/billease.png",
  JCB_MAYA: "/bank-logos/jcb.png",
  MASTERCARD_MAYA: "/bank-logos/mastercard.png",
  QRPH: "/bank-logos/qrph.svg",
  VBANK: "/bank-logos/vbank.png",
  VISA_MAYA: "/bank-logos/visa.png",
  BPISAMILYSAVINGS: "/bank-logos/bpi-family-savings.png",
  DISKARTECH: "/bank-logos/diskartech.png",
  GCASH: "/bank-logos/gcash.png",
  LANDBANK: "/bank-logos/landbank.png",
  METROBANK: "/bank-logos/metrobank.png",
  NETBANK: "/bank-logos/netbank.png",
  RCBC: "/bank-logos/rcbc.png",
  UNIONBANK: "/bank-logos/unionbank.png",
  NETIZEN: "/bank-logos/netizen.png",
  PALAWAN: "/bank-logos/palawan-pawnshop.jpg",
  "BDO UNIBANK": "/bank-logos/bdo.png",
  "BANK OF THE PHILIPPINE ISLANDS": "/bank-logos/bpi.png",
  "BPI FAMILY SAVINGS BANK": "/bank-logos/bpi-family-savings.png",
  "LAND BANK": "/bank-logos/landbank.png",
  "UNION BANK OF THE PHILIPPINES": "/bank-logos/unionbank.png",
  "PALAWAN PAWNSHOP": "/bank-logos/palawan-pawnshop.jpg",
};

export function getInstitutionLogoAsset(code: string, name: string) {
  return institutionLogoAssets[code] || institutionLogoAssets[name.trim().toUpperCase()];
}
