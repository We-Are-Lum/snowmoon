/**
 * Where each closed model's maker serves (branch challenge-models, owner, 2026-11-08). The challenge's remix screen
 * offers a closed model only where its maker serves; the server reads the visitor's country from Vercel's
 * `x-vercel-ip-country` header (and, for Ukraine only, `x-vercel-ip-country-region`) for that one request, and never
 * stores or logs it. Pure: no network, no database, so scripts/test-model-choice.ts proves every rule on stand-ins.
 *
 * - OpenAI (GPT Image 2.5 Sunburst): only in OpenAI's supported countries and territories, from
 *   https://developers.openai.com/api/docs/supported-countries, read 2026-11-08 by the coding agent's fetch tool
 *   (HTTP 200; the page shows no "last updated" date). The page: "Accessing or offering access to our services outside
 *   of the countries and territories listed below … may result in your account being blocked or suspended". The list
 *   is copied below by name, in the page's order, each with its ISO 3166-1 code; "Ukraine (with certain exceptions)"
 *   is read as the sanctioned regions below. Never in an embargoed country or region, listed or not.
 * - Google (Gemini 3.1 Flash Image, through Vertex AI): Google publishes no end-user country list for Vertex; its
 *   Cloud terms bind us to US export-control and sanctions law (Google Cloud Platform Terms of Service §3.3(viii),
 *   §8.6; checked by the coordinator, 2026-11-08). The owner's decision (2026-11-08): ONE list for both closed models,
 *   so Gemini is offered exactly where GPT is: OpenAI's list, minus the embargoed set.
 * - Embargoed (US comprehensive sanctions): Cuba, Iran, North Korea, Syria, and Ukraine's Crimea, Sevastopol, Donetsk
 *   and Luhansk regions (the so-called DNR and LNR). The header gives a region, not the line of control, so all of
 *   Donetsk and Luhansk are treated as embargoed, and a Ukrainian connection with no region is too (conservative,
 *   flagged to the owner).
 * - No header (local, previews, a request that didn't come through Vercel's edge): no closed model, unless a test
 *   override names a country, and never in production (closedCountryOverride).
 */

/** OpenAI's list, word for word by name, in the page's order (2026-11-08), with each name's ISO 3166-1 alpha-2 code. */
export const OPENAI_SUPPORTED: readonly (readonly [string, string])[] = [
  ['Albania', 'AL'], ['Algeria', 'DZ'], ['Afghanistan', 'AF'], ['Aland Islands', 'AX'], ['Andorra', 'AD'], ['Angola', 'AO'],
  ['Antigua and Barbuda', 'AG'], ['Argentina', 'AR'], ['Armenia', 'AM'], ['Aruba', 'AW'], ['Australia', 'AU'], ['Austria', 'AT'],
  ['Azerbaijan', 'AZ'], ['Bahamas', 'BS'], ['Bahrain', 'BH'], ['Bangladesh', 'BD'], ['Barbados', 'BB'], ['Belgium', 'BE'],
  ['Belize', 'BZ'], ['Bermuda', 'BM'], ['Benin', 'BJ'], ['Bhutan', 'BT'], ['Bolivia', 'BO'], ['Bosnia and Herzegovina', 'BA'],
  ['Botswana', 'BW'], ['Brazil', 'BR'], ['Brunei', 'BN'], ['Bulgaria', 'BG'], ['Burkina Faso', 'BF'], ['Burundi', 'BI'],
  ['Cabo Verde', 'CV'], ['Cambodia', 'KH'], ['Cameroon', 'CM'], ['Canada', 'CA'], ['Cayman Islands', 'KY'],
  ['Central African Republic', 'CF'], ['Chad', 'TD'], ['Chile', 'CL'], ['Colombia', 'CO'], ['Comoros', 'KM'],
  ['Congo (Brazzaville)', 'CG'], ['Congo (DRC)', 'CD'], ['Costa Rica', 'CR'], ['Côte d\'Ivoire', 'CI'], ['Croatia', 'HR'],
  ['Cyprus', 'CY'], ['Czechia (Czech Republic)', 'CZ'], ['Denmark', 'DK'], ['Djibouti', 'DJ'], ['Dominica', 'DM'],
  ['Dominican Republic', 'DO'], ['Ecuador', 'EC'], ['Egypt', 'EG'], ['El Salvador', 'SV'], ['Equatorial Guinea', 'GQ'],
  ['Eritrea', 'ER'], ['Estonia', 'EE'], ['Eswatini (Swaziland)', 'SZ'], ['Ethiopia', 'ET'], ['Faroe Islands', 'FO'], ['Fiji', 'FJ'],
  ['Finland', 'FI'], ['France', 'FR'], ['French Guiana', 'GF'], ['French Polynesia', 'PF'], ['French Southern Territories', 'TF'],
  ['Gabon', 'GA'], ['Gambia', 'GM'], ['Georgia', 'GE'], ['Germany', 'DE'], ['Ghana', 'GH'], ['Greece', 'GR'], ['Grenada', 'GD'],
  ['Greenland', 'GL'], ['Guatemala', 'GT'], ['Guadeloupe', 'GP'], ['Guinea', 'GN'], ['Guinea-Bissau', 'GW'], ['Guyana', 'GY'],
  ['Haiti', 'HT'], ['Holy See (Vatican City)', 'VA'], ['Honduras', 'HN'], ['Hungary', 'HU'], ['Iceland', 'IS'], ['India', 'IN'],
  ['Indonesia', 'ID'], ['Iraq', 'IQ'], ['Ireland', 'IE'], ['Israel', 'IL'], ['Italy', 'IT'], ['Jamaica', 'JM'], ['Japan', 'JP'],
  ['Jordan', 'JO'], ['Kazakhstan', 'KZ'], ['Kenya', 'KE'], ['Kiribati', 'KI'], ['Kuwait', 'KW'], ['Kyrgyzstan', 'KG'], ['Laos', 'LA'],
  ['Latvia', 'LV'], ['Lebanon', 'LB'], ['Lesotho', 'LS'], ['Liberia', 'LR'], ['Libya', 'LY'], ['Liechtenstein', 'LI'],
  ['Lithuania', 'LT'], ['Luxembourg', 'LU'], ['Madagascar', 'MG'], ['Malawi', 'MW'], ['Malaysia', 'MY'], ['Maldives', 'MV'],
  ['Mali', 'ML'], ['Malta', 'MT'], ['Marshall Islands', 'MH'], ['Martinique', 'MQ'], ['Mauritania', 'MR'], ['Mauritius', 'MU'],
  ['Mayotte', 'YT'], ['Mexico', 'MX'], ['Micronesia', 'FM'], ['Moldova', 'MD'], ['Monaco', 'MC'], ['Mongolia', 'MN'],
  ['Montenegro', 'ME'], ['Morocco', 'MA'], ['Mozambique', 'MZ'], ['Myanmar', 'MM'], ['Namibia', 'NA'], ['Nauru', 'NR'],
  ['Nepal', 'NP'], ['Netherlands', 'NL'], ['New Caledonia', 'NC'], ['New Zealand', 'NZ'], ['Nicaragua', 'NI'], ['Niger', 'NE'],
  ['Nigeria', 'NG'], ['North Macedonia', 'MK'], ['Norway', 'NO'], ['Oman', 'OM'], ['Pakistan', 'PK'], ['Palau', 'PW'],
  ['Palestine', 'PS'], ['Panama', 'PA'], ['Papua New Guinea', 'PG'], ['Paraguay', 'PY'], ['Peru', 'PE'], ['Philippines', 'PH'],
  ['Poland', 'PL'], ['Portugal', 'PT'], ['Qatar', 'QA'], ['Réunion', 'RE'], ['Romania', 'RO'], ['Rwanda', 'RW'],
  ['Saint Barthelemy', 'BL'], ['Saint Helena', 'SH'], ['Saint Kitts and Nevis', 'KN'], ['Saint Lucia', 'LC'],
  ['Saint Martin (French part)', 'MF'], ['Saint Pierre and Miquelon', 'PM'], ['Saint Vincent and the Grenadines', 'VC'],
  ['Samoa', 'WS'], ['San Marino', 'SM'], ['Sao Tome and Principe', 'ST'], ['Saudi Arabia', 'SA'], ['Senegal', 'SN'],
  ['Serbia', 'RS'], ['Seychelles', 'SC'], ['Sierra Leone', 'SL'], ['Singapore', 'SG'], ['Slovakia', 'SK'], ['Slovenia', 'SI'],
  ['Solomon Islands', 'SB'], ['Somalia', 'SO'], ['South Africa', 'ZA'], ['South Korea', 'KR'], ['South Sudan', 'SS'],
  ['Spain', 'ES'], ['Sri Lanka', 'LK'], ['Suriname', 'SR'], ['Sweden', 'SE'], ['Switzerland', 'CH'], ['Sudan', 'SD'],
  ['Svalbard and Jan Mayen', 'SJ'], ['Taiwan', 'TW'], ['Tajikistan', 'TJ'], ['Tanzania', 'TZ'], ['Thailand', 'TH'],
  ['Timor-Leste (East Timor)', 'TL'], ['Togo', 'TG'], ['Tonga', 'TO'], ['Trinidad and Tobago', 'TT'], ['Tunisia', 'TN'],
  ['Turkey', 'TR'], ['Turkmenistan', 'TM'], ['Tuvalu', 'TV'], ['Uganda', 'UG'], ['Ukraine (with certain exceptions)', 'UA'],
  ['United Arab Emirates', 'AE'], ['United Kingdom', 'GB'], ['United States of America', 'US'], ['Uruguay', 'UY'],
  ['Uzbekistan', 'UZ'], ['Vanuatu', 'VU'], ['Vietnam', 'VN'], ['Wallis and Futuna', 'WF'], ['Yemen', 'YE'], ['Zambia', 'ZM'],
  ['Zimbabwe', 'ZW'],
];
export const OPENAI_LIST_SOURCE = { url: 'https://developers.openai.com/api/docs/supported-countries', read: '2026-11-08' } as const;
const OPENAI_CODES: ReadonlySet<string> = new Set(OPENAI_SUPPORTED.map(([, c]) => c));

/** US comprehensive sanctions: whole countries. */
export const EMBARGOED_COUNTRIES: readonly string[] = ['CU', 'IR', 'KP', 'SY'];
/** And regions of Ukraine (ISO 3166-2 UA-xx, as Vercel's region header gives the part after the hyphen). */
export const EMBARGOED_UA_REGIONS: readonly string[] = ['43', '40', '14', '09']; // Crimea, Sevastopol, Donetsk, Luhansk

export type Maker = 'OpenAI' | 'Google';
export interface Where {
  /** ISO 3166-1 alpha-2, upper case; null when the request didn't say. */
  country: string | null;
  /** The region code after the hyphen (ISO 3166-2), or null. Read only for Ukraine. */
  region: string | null;
}

/** Is this connection in an embargoed country or region? A Ukrainian connection with no region counts as one. */
export function embargoed(w: Where): boolean {
  if (!w.country) return false;
  if (EMBARGOED_COUNTRIES.includes(w.country)) return true;
  if (w.country === 'UA') return !w.region || EMBARGOED_UA_REGIONS.includes(w.region.padStart(2, '0'));
  return false;
}

/**
 * May this maker's closed model be offered to a connection from here? One list for both makers (owner, 2026-11-08):
 * OpenAI's supported countries, minus the embargoed set. No country: never.
 */
export function makerServes(maker: Maker, w: Where): boolean {
  if (!w.country || embargoed(w)) return false;
  if (maker !== 'OpenAI' && maker !== 'Google') return false;
  return OPENAI_CODES.has(w.country);
}

/**
 * A test override for the country (local and preview runs, where Vercel's header is absent): the env var
 * CLOSED_MODELS_TEST_COUNTRY ("FR", or "UA-43"), honoured only outside production. Returns null when unset.
 */
export function closedCountryOverride(env: Record<string, string | undefined> = process.env): Where | null {
  if (env.VERCEL_ENV === 'production') return null;
  const v = env.CLOSED_MODELS_TEST_COUNTRY?.trim().toUpperCase();
  if (!v || !/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(v)) return null;
  const [country, region] = v.split('-');
  return { country, region: region ?? null };
}

/**
 * The visitor's country, for this request only, from Vercel's headers (or the test override when they're absent).
 * Used to decide, then dropped: never stored, logged, or sent anywhere.
 */
export function whereFrom(headers: Headers, env: Record<string, string | undefined> = process.env): Where {
  const c = headers.get('x-vercel-ip-country')?.trim().toUpperCase() ?? '';
  if (/^[A-Z]{2}$/.test(c)) {
    const r = c === 'UA' ? (headers.get('x-vercel-ip-country-region')?.trim().toUpperCase() ?? '') : '';
    return { country: c, region: r ? decodeURIComponent(r) : null };
  }
  return closedCountryOverride(env) ?? { country: null, region: null };
}
