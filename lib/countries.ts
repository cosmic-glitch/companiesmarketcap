// ISO 3166-1 alpha-2 → flag emoji + full name
// Flag emojis are derived from regional indicator symbols (each letter offset from 0x1F1E5)

function codeToFlag(code: string): string {
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E5 + c.charCodeAt(0) - 64)).join('');
}

const COUNTRY_NAMES: Record<string, string> = {
  AE: "UAE",
  AR: "Argentina",
  AU: "Australia",
  BE: "Belgium",
  BM: "Bermuda",
  BR: "Brazil",
  BS: "Bahamas",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CR: "Costa Rica",
  DE: "Germany",
  DK: "Denmark",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  GG: "Guernsey",
  GR: "Greece",
  HK: "Hong Kong",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IS: "Iceland",
  IT: "Italy",
  JE: "Jersey",
  JO: "Jordan",
  JP: "Japan",
  KR: "South Korea",
  KY: "Cayman Islands",
  KZ: "Kazakhstan",
  LU: "Luxembourg",
  MC: "Monaco",
  MX: "Mexico",
  NL: "Netherlands",
  NO: "Norway",
  PA: "Panama",
  PE: "Peru",
  PH: "Philippines",
  SE: "Sweden",
  SG: "Singapore",
  TW: "Taiwan",
  TR: "Turkey",
  US: "United States",
  UY: "Uruguay",
  VN: "Vietnam",
  ZA: "South Africa",
};

export const COUNTRIES: Record<string, { flag: string; name: string }> = Object.fromEntries(
  Object.entries(COUNTRY_NAMES).map(([code, name]) => [code, { flag: codeToFlag(code), name }])
);

export function formatCountry(code: string): string {
  const entry = COUNTRIES[code];
  if (!entry) return code;
  return `${entry.flag} ${entry.name}`;
}
