export interface TimezoneOption {
  value: string
  label: string
  recommendedLang: string
}

export interface LanguageOption {
  value: string
  label: string
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Asia/Shanghai', label: '中国大陆 - Asia/Shanghai', recommendedLang: 'zh-CN' },
  { value: 'Asia/Hong_Kong', label: '中国香港 - Asia/Hong_Kong', recommendedLang: 'zh-HK' },
  { value: 'Asia/Taipei', label: '中国台湾 - Asia/Taipei', recommendedLang: 'zh-TW' },
  { value: 'Asia/Tokyo', label: '日本 - Asia/Tokyo', recommendedLang: 'ja-JP' },
  { value: 'Asia/Seoul', label: '韩国 - Asia/Seoul', recommendedLang: 'ko-KR' },
  { value: 'Asia/Singapore', label: '新加坡 - Asia/Singapore', recommendedLang: 'en-SG' },
  { value: 'Asia/Bangkok', label: '泰国 - Asia/Bangkok', recommendedLang: 'th-TH' },
  { value: 'Asia/Jakarta', label: '印尼 - Asia/Jakarta', recommendedLang: 'id-ID' },
  { value: 'Asia/Manila', label: '菲律宾 - Asia/Manila', recommendedLang: 'en-PH' },
  { value: 'Asia/Kolkata', label: '印度 - Asia/Kolkata', recommendedLang: 'hi-IN' },
  { value: 'Asia/Dubai', label: '阿联酋 - Asia/Dubai', recommendedLang: 'ar-AE' },
  { value: 'Europe/London', label: '英国 - Europe/London', recommendedLang: 'en-GB' },
  { value: 'Europe/Paris', label: '法国 - Europe/Paris', recommendedLang: 'fr-FR' },
  { value: 'Europe/Berlin', label: '德国 - Europe/Berlin', recommendedLang: 'de-DE' },
  { value: 'Europe/Madrid', label: '西班牙 - Europe/Madrid', recommendedLang: 'es-ES' },
  { value: 'Europe/Rome', label: '意大利 - Europe/Rome', recommendedLang: 'it-IT' },
  { value: 'Europe/Amsterdam', label: '荷兰 - Europe/Amsterdam', recommendedLang: 'nl-NL' },
  { value: 'Europe/Moscow', label: '俄罗斯 - Europe/Moscow', recommendedLang: 'ru-RU' },
  { value: 'America/New_York', label: '美国东部 - America/New_York', recommendedLang: 'en-US' },
  { value: 'America/Chicago', label: '美国中部 - America/Chicago', recommendedLang: 'en-US' },
  { value: 'America/Denver', label: '美国山地 - America/Denver', recommendedLang: 'en-US' },
  { value: 'America/Los_Angeles', label: '美国西部 - America/Los_Angeles', recommendedLang: 'en-US' },
  { value: 'America/Toronto', label: '加拿大东部 - America/Toronto', recommendedLang: 'en-CA' },
  { value: 'America/Vancouver', label: '加拿大西部 - America/Vancouver', recommendedLang: 'en-CA' },
  { value: 'America/Mexico_City', label: '墨西哥 - America/Mexico_City', recommendedLang: 'es-MX' },
  { value: 'America/Sao_Paulo', label: '巴西 - America/Sao_Paulo', recommendedLang: 'pt-BR' },
  { value: 'America/Buenos_Aires', label: '阿根廷 - America/Buenos_Aires', recommendedLang: 'es-AR' },
  { value: 'Australia/Sydney', label: '澳大利亚 - Australia/Sydney', recommendedLang: 'en-AU' },
  { value: 'Pacific/Auckland', label: '新西兰 - Pacific/Auckland', recommendedLang: 'en-NZ' },
  { value: 'Africa/Johannesburg', label: '南非 - Africa/Johannesburg', recommendedLang: 'en-ZA' },
  { value: 'Africa/Cairo', label: '埃及 - Africa/Cairo', recommendedLang: 'ar-EG' },
]

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: 'zh-CN', label: '简体中文 - zh-CN' },
  { value: 'zh-HK', label: '香港繁体中文 - zh-HK' },
  { value: 'zh-TW', label: '台湾繁体中文 - zh-TW' },
  { value: 'en-US', label: 'English (US) - en-US' },
  { value: 'en-GB', label: 'English (UK) - en-GB' },
  { value: 'en-CA', label: 'English (Canada) - en-CA' },
  { value: 'en-AU', label: 'English (Australia) - en-AU' },
  { value: 'en-NZ', label: 'English (New Zealand) - en-NZ' },
  { value: 'en-SG', label: 'English (Singapore) - en-SG' },
  { value: 'en-PH', label: 'English (Philippines) - en-PH' },
  { value: 'ja-JP', label: '日本語 - ja-JP' },
  { value: 'ko-KR', label: '한국어 - ko-KR' },
  { value: 'th-TH', label: 'ไทย - th-TH' },
  { value: 'id-ID', label: 'Bahasa Indonesia - id-ID' },
  { value: 'hi-IN', label: 'हिन्दी - hi-IN' },
  { value: 'ar-AE', label: 'العربية (UAE) - ar-AE' },
  { value: 'ar-EG', label: 'العربية (Egypt) - ar-EG' },
  { value: 'fr-FR', label: 'Français - fr-FR' },
  { value: 'de-DE', label: 'Deutsch - de-DE' },
  { value: 'es-ES', label: 'Español (España) - es-ES' },
  { value: 'es-MX', label: 'Español (México) - es-MX' },
  { value: 'es-AR', label: 'Español (Argentina) - es-AR' },
  { value: 'it-IT', label: 'Italiano - it-IT' },
  { value: 'nl-NL', label: 'Nederlands - nl-NL' },
  { value: 'ru-RU', label: 'Русский - ru-RU' },
  { value: 'pt-BR', label: 'Português (Brasil) - pt-BR' },
]

export function getRecommendedLanguageForTimezone(timezone?: string): string | undefined {
  return TIMEZONE_OPTIONS.find(option => option.value === timezone)?.recommendedLang
}

export function isKnownTimezone(timezone?: string): boolean {
  return !!timezone && TIMEZONE_OPTIONS.some(option => option.value === timezone)
}

export function isKnownLanguage(language?: string): boolean {
  return !!language && LANGUAGE_OPTIONS.some(option => option.value === language)
}
