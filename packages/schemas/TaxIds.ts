// Country-specific tax identifier rules. Format and, where published, checksum
// validation only: this proves an identifier is well formed for the claimed
// country, not that a tax authority has issued it.

export type TaxIdKind = 'TAX_ID' | 'VAT'

interface Rule {
  checksum?: (value: string) => boolean
  example: string
  label: string
  pattern: RegExp
}

export interface TaxIdResult {
  example?: string
  label: string
  normalized: string
  valid: boolean
}

const digits = (value: string) => [...value].map(Number)

const gstin = (value: string) => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const sum = [...value.slice(0, 14)].reduce((total, char, index) => {
    const product = chars.indexOf(char) * (index % 2 ? 2 : 1)
    return total + Math.floor(product / 36) + (product % 36)
  }, 0)
  return chars[(36 - (sum % 36)) % 36] === value[14]
}

const abn = (value: string) => {
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const values = digits(value)
  values[0] -= 1
  return values.reduce((total, digit, index) => total + digit * weights[index], 0) % 89 === 0
}

const luhn = (value: string) => digits(value).reverse().reduce((total, digit, index) => {
  if (index % 2 === 0) return total + digit
  const doubled = digit * 2
  return total + (doubled > 9 ? doubled - 9 : doubled)
}, 0) % 10 === 0

const ukVat = (value: string) => {
  const body = value.replace(/^GB/, '').slice(0, 9)
  if (!/^\d{9}$/.test(body)) return false
  const values = digits(body)
  const weighted = [8, 7, 6, 5, 4, 3, 2].reduce((total, weight, index) => total + weight * values[index], 0)
  const check = values[7] * 10 + values[8]
  return [weighted + check, weighted + check + 55].some((total) => total % 97 === 0)
}

const RULES: Record<string, Partial<Record<TaxIdKind, Rule>>> = {
  AE: { VAT: { example: '100123456700003', label: 'UAE Tax Registration Number (TRN)', pattern: /^100\d{12}$/ } },
  AU: { TAX_ID: { checksum: abn, example: '51824753556', label: 'Australian Business Number (ABN)', pattern: /^\d{11}$/ } },
  CA: { TAX_ID: { checksum: luhn, example: '123456782', label: 'Canadian Business Number (BN)', pattern: /^\d{9}(RT\d{4})?$/ } },
  DE: { VAT: { example: 'DE123456789', label: 'German VAT ID (USt-IdNr.)', pattern: /^DE\d{9}$/ } },
  ES: { VAT: { example: 'ESX1234567X', label: 'Spanish VAT ID', pattern: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/ } },
  FR: { VAT: { example: 'FR12345678901', label: 'French VAT ID', pattern: /^FR[A-Z0-9]{2}\d{9}$/ } },
  GB: { VAT: { checksum: ukVat, example: 'GB980780684', label: 'UK VAT registration number', pattern: /^GB(\d{9}|\d{12})$/ } },
  IE: { VAT: { example: 'IE1234567T', label: 'Irish VAT ID', pattern: /^IE\d{7}[A-W][A-I]?$|^IE\d[A-Z+*]\d{5}[A-W]$/ } },
  IN: {
    TAX_ID: { example: 'AAAPL1234C', label: 'Indian PAN', pattern: /^[A-Z]{5}\d{4}[A-Z]$/ },
    VAT: { checksum: gstin, example: '27AAPFU0939F1ZV', label: 'Indian GSTIN', pattern: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/ },
  },
  IT: { VAT: { example: 'IT12345678901', label: 'Italian VAT ID (Partita IVA)', pattern: /^IT\d{11}$/ } },
  NL: { VAT: { example: 'NL123456789B01', label: 'Dutch VAT ID', pattern: /^NL\d{9}B\d{2}$/ } },
  SG: { TAX_ID: { example: '201912345K', label: 'Singapore UEN', pattern: /^(\d{8}[A-Z]|\d{9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$/ } },
  US: { TAX_ID: { example: '12-3456789', label: 'US Employer Identification Number (EIN)', pattern: /^\d{9}$/ } },
}

export class TaxIds {
  static normalize(value: string) {
    return value.replace(/[\s.-]/g, '').toUpperCase()
  }

  static rule(country: string, kind: TaxIdKind) {
    return RULES[country.toUpperCase()]?.[kind]
  }

  /** Validate an identifier for a country. Countries without a published rule only get a generic shape check. */
  static check(country: string, kind: TaxIdKind, value: string): TaxIdResult {
    const normalized = TaxIds.normalize(value)
    const rule = TaxIds.rule(country, kind)
    if (!rule) {
      return { label: kind === 'VAT' ? 'VAT registration number' : 'tax ID', normalized, valid: /^[A-Z0-9]{4,40}$/.test(normalized) }
    }
    const valid = rule.pattern.test(normalized) && (!rule.checksum || rule.checksum(normalized))
    return { example: rule.example, label: rule.label, normalized, valid }
  }

  /** A supplier-facing explanation for an identifier that failed `check`. */
  static message(country: string, kind: TaxIdKind, result: TaxIdResult) {
    const expected = result.example ? ` Expected a ${result.label}, for example ${result.example}.` : ''
    return `The ${kind === 'VAT' ? 'VAT registration number' : 'tax ID'} is not valid for ${country.toUpperCase()}.${expected}`
  }

  /** The first problem with a tax profile's identifiers for the country, or undefined when they are well formed. */
  static problem(country: string, tax: { taxId?: string | null; vatRegistered: boolean; vatTrn?: string | null }) {
    if (tax.taxId) {
      const result = TaxIds.check(country, 'TAX_ID', tax.taxId)
      if (!result.valid) return TaxIds.message(country, 'TAX_ID', result)
    }
    if (tax.vatRegistered && !tax.vatTrn) return 'Enter the VAT registration number, or set VAT registered to false.'
    if (tax.vatTrn) {
      const result = TaxIds.check(country, 'VAT', tax.vatTrn)
      if (!result.valid) return TaxIds.message(country, 'VAT', result)
    }
    return undefined
  }
}
