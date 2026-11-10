/** South-India location rules: canonical city names, state names, and remote-India detection. */

const CITY_VARIANTS: Record<string, string> = {
  hyderabad: "Hyderabad",
  secunderabad: "Hyderabad",
  bengaluru: "Bengaluru",
  bangalore: "Bengaluru",
  chennai: "Chennai",
  madras: "Chennai",
  coimbatore: "Coimbatore",
  visakhapatnam: "Visakhapatnam",
  vishakhapatnam: "Visakhapatnam",
  vizag: "Visakhapatnam",
  vijayawada: "Vijayawada",
  guntur: "Guntur",
  tirupati: "Tirupati",
  kakinada: "Kakinada",
  rajahmundry: "Rajahmundry",
  warangal: "Warangal",
  kochi: "Kochi",
  cochin: "Kochi",
  thiruvananthapuram: "Thiruvananthapuram",
  trivandrum: "Thiruvananthapuram",
  kozhikode: "Kozhikode",
  calicut: "Kozhikode",
  mysuru: "Mysuru",
  mysore: "Mysuru",
  mangaluru: "Mangaluru",
  mangalore: "Mangaluru",
  hubballi: "Hubballi",
  hubli: "Hubballi",
  madurai: "Madurai",
  tiruchirappalli: "Tiruchirappalli",
  trichy: "Tiruchirappalli",
  salem: "Salem",
  puducherry: "Puducherry",
  pondicherry: "Puducherry",
};

const SOUTH_STATES = [
  "andhra pradesh",
  "telangana",
  "karnataka",
  "tamil nadu",
  "tamilnadu",
  "kerala",
  "puducherry",
  "pondicherry",
];

const OTHER_COUNTRIES =
  /\b(us|usa|united states|uk|united kingdom|canada|europe|emea|germany|singapore|australia|uae|dubai|latam|mexico|brazil|japan)\b/;

const SEPARATORS = /[/;,|]|\bor\b/;

export interface LocationInfo {
  cities: string[];
  southIndia: boolean;
  remoteIndia: boolean;
}

export function normaliseLocation(raw: string[]): LocationInfo {
  const cities = new Set<string>();
  let southState = false;
  let remoteIndia = false;

  for (const entry of raw) {
    const text = entry.toLowerCase();
    const foreign = OTHER_COUNTRIES.test(text);
    if (!foreign) {
      for (const part of text.split(SEPARATORS)) {
        for (const word of part.trim().split(/[^a-z]+/)) {
          const city = CITY_VARIANTS[word];
          if (city) cities.add(city);
        }
      }
      if (SOUTH_STATES.some((s) => text.includes(s))) southState = true;
    }
    const remote = /\bremote\b/.test(text);
    const india = /\bindia\b/.test(text);
    const anywhere = /\b(anywhere|worldwide|global)\b/.test(text) && !OTHER_COUNTRIES.test(text);
    if ((remote && india) || anywhere) remoteIndia = true;
  }

  return { cities: [...cities], southIndia: cities.size > 0 || southState, remoteIndia };
}
