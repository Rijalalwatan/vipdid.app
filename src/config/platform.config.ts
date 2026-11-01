export const platformConfig = {
  domain: import.meta.env.VITE_PLATFORM_DOMAIN ?? 'vipdid.app',
  subdomainPattern: import.meta.env.VITE_SUBDOMAIN_PATTERN ?? '*.vipdid.app',
  names: {
    ar: 'الهوية الرقمية لكبار الشخصيات',
    en: 'VIP Digital ID'
  },
  ownership: {
    ar: 'شركة الهوية الرقمية',
    en: 'Digital id Company'
  },
  contact: {
    ownerEmail: 'rijalalwatan.com@gmail.com',
    supportEmail: 'vip.did.app@gmail.com',
    whatsapp: '966555444959'
  },
  assets: {
    logo: '/brand/logo.webp',
    coverDark: '/brand/cover.webp',
    coverLight: '/brand/cover-light.webp'
  },
  palette: {
    gold: '#d8ae52',
    goldBright: '#f6d98f',
    charcoal: '#090b0e',
    ivory: '#f6f2e8'
  }
} as const;

export type PlatformLocale = keyof typeof platformConfig.names;
