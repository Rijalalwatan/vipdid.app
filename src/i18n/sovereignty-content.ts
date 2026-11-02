export type SovereigntyLocale = 'ar' | 'en';

type Copy = {
  sovereignTitle: string; sovereignLead: string; tabs: { lock: string; review: string; supervisors: string; managed: string; partners: string; treasury: string; audit: string };
  lockTitle: string; lockLead: string; lockEnabled: string; lockDisabled: string; password: string; saveLock: string; saved: string;
  reviewTitle: string; reviewLead: string; search: string; approve: string; requestChanges: string; reject: string; reason: string; noReviews: string;
  supervisorsTitle: string; supervisorsLead: string; name: string; email: string; createSupervisor: string;
  managedTitle: string; managedLead: string; createManaged: string; path: string; deliverCustody: string; recipientEmail: string; sendInvitation: string;
  partnersTitle: string; partnersLead: string; partnerSlug: string; partnerName: string; createPartner: string; approvePartner: string; noPartners: string;
  treasuryTitle: string; treasuryLead: string; auditTitle: string; auditLead: string;
  partnerTitle: string; partnerLead: string; usersTitle: string; reviewsTitle: string; settingsTitle: string;
  requestPartner: string; requestPartnerLead: string; submitRequest: string; requested: string;
  custodyTitle: string; custodyLead: string; custodyPin: string; confirmCustody: string; custodyAccepted: string; custodyInvalid: string;
  loading: string; save: string; cancel: string; error: string; success: string;
};

export const sovereigntyContent: Record<SovereigntyLocale, Copy> = {
  ar: {
    sovereignTitle: 'لوحة السيادة', sovereignLead: 'إدارة أصل الهوية الرقمية والعُضداء والعهدة ضمن ضوابط مركزية.',
    tabs: { lock: 'قفل المنصة', review: 'المراجعة', supervisors: 'المشرفون', managed: 'الحسابات المُدارة', partners: 'العُضداء', treasury: 'الخزينة', audit: 'سجل التدقيق' },
    lockTitle: 'قفل المنصة', lockLead: 'فعّل القفل المؤقت أو حدّث كلمة المرور المعتمدة.', lockEnabled: 'القفل مفعّل', lockDisabled: 'القفل متوقف', password: 'كلمة المرور', saveLock: 'حفظ القفل', saved: 'تم الحفظ',
    reviewTitle: 'مركز المراجعة والاعتماد', reviewLead: 'راجع الطلبات ضمن الصلاحية المخولة واتخذ قراراً موثقاً.', search: 'البحث', approve: 'اعتماد', requestChanges: 'طلب تعديل', reject: 'رفض', reason: 'سبب القرار', noReviews: 'لا توجد طلبات مطابقة.',
    supervisorsTitle: 'المشرفون المفوضون', supervisorsLead: 'أنشئ مشرفاً ضمن نطاق محدد ثم سلّم له العهدة بالبريد عند الحاجة.', name: 'الاسم', email: 'البريد الإلكتروني', createSupervisor: 'إنشاء مشرف',
    managedTitle: 'الحسابات المُدارة', managedLead: 'أنشئ حساباً مُداراً وجهّز مساره ثم أرسل دعوة العهدة لصاحبه.', createManaged: 'إنشاء حساب مُدار', path: 'المسار القصير', deliverCustody: 'تسليم العهدة', recipientEmail: 'بريد المستلم', sendInvitation: 'إرسال الدعوة',
    partnersTitle: 'نظام العضيد', partnersLead: 'اعتمد الطلبات أو أنشئ عضيداً مستقلاً ضمن البنية المركزية.', partnerSlug: 'النطاق الفرعي', partnerName: 'اسم العضيد', createPartner: 'إنشاء عضيد', approvePartner: 'اعتماد العضيد', noPartners: 'لا توجد طلبات عضيد حالياً.',
    treasuryTitle: 'الخزينة المركزية', treasuryLead: 'رصيد نقطة الوسط المركزي تحت السيادة المباشرة للمالك.', auditTitle: 'سجل التدقيق', auditLead: 'أحدث العمليات السيادية والقرارات المسجلة.',
    partnerTitle: 'لوحة العضيد', partnerLead: 'إدارة مستقلة لنطاقك ضمن السيادة المركزية للمنصة.', usersTitle: 'مستخدمو النطاق', reviewsTitle: 'طلبات النشر', settingsTitle: 'هوية النطاق',
    requestPartner: 'طلب عضيد', requestPartnerLead: 'اطلب نطاقك الفرعي ليخضع لاعتماد المالك الرئيسي.', submitRequest: 'إرسال الطلب', requested: 'تم إرسال الطلب للاعتماد.',
    custodyTitle: 'استلام العهدة', custodyLead: 'أكد استلام الإدارة وحدد رمز PIN خاصاً بك.', custodyPin: 'رمز PIN من ستة أرقام', confirmCustody: 'تأكيد الاستلام', custodyAccepted: 'تم تسليم العهدة بنجاح.', custodyInvalid: 'رابط العهدة غير صالح أو منتهٍ.',
    loading: 'جارٍ التحميل', save: 'حفظ', cancel: 'إلغاء', error: 'تعذر إتمام العملية. راجع البيانات وحاول مرة أخرى.', success: 'تمت العملية بنجاح.'
  },
  en: {
    sovereignTitle: 'Sovereign Console', sovereignLead: 'Manage the Digital ID asset, partners, and custody under central controls.',
    tabs: { lock: 'Platform lock', review: 'Reviews', supervisors: 'Supervisors', managed: 'Managed accounts', partners: 'Partners', treasury: 'Treasury', audit: 'Audit log' },
    lockTitle: 'Platform lock', lockLead: 'Enable a temporary lock or update the approved password.', lockEnabled: 'Lock enabled', lockDisabled: 'Lock disabled', password: 'Password', saveLock: 'Save lock', saved: 'Saved',
    reviewTitle: 'Review and approval center', reviewLead: 'Review in-scope requests and record a governed decision.', search: 'Search', approve: 'Approve', requestChanges: 'Request changes', reject: 'Reject', reason: 'Decision reason', noReviews: 'No matching requests.',
    supervisorsTitle: 'Delegated supervisors', supervisorsLead: 'Create a scoped supervisor and transfer custody by email when needed.', name: 'Name', email: 'Email', createSupervisor: 'Create supervisor',
    managedTitle: 'Managed accounts', managedLead: 'Create a managed account, prepare its path, then send a custody invitation to its owner.', createManaged: 'Create managed account', path: 'Short path', deliverCustody: 'Transfer custody', recipientEmail: 'Recipient email', sendInvitation: 'Send invitation',
    partnersTitle: 'Partner system', partnersLead: 'Approve requests or create an independent partner inside the central platform.', partnerSlug: 'Subdomain', partnerName: 'Partner name', createPartner: 'Create partner', approvePartner: 'Approve partner', noPartners: 'There are no partner requests at this time.',
    treasuryTitle: 'Central treasury', treasuryLead: 'The Mid Point balance remains under the owner’s direct sovereignty.', auditTitle: 'Audit log', auditLead: 'Recent recorded sovereign actions and decisions.',
    partnerTitle: 'Partner console', partnerLead: 'A separate workspace for your subdomain under the platform’s central sovereignty.', usersTitle: 'Subdomain users', reviewsTitle: 'Publication requests', settingsTitle: 'Subdomain identity',
    requestPartner: 'Request a partner', requestPartnerLead: 'Request your subdomain for primary owner approval.', submitRequest: 'Send request', requested: 'Your request was submitted for approval.',
    custodyTitle: 'Accept custody', custodyLead: 'Confirm management transfer and choose your personal PIN.', custodyPin: 'Six-digit PIN', confirmCustody: 'Accept transfer', custodyAccepted: 'Custody was transferred successfully.', custodyInvalid: 'This custody link is invalid or expired.',
    loading: 'Loading', save: 'Save', cancel: 'Cancel', error: 'The operation could not be completed. Review the information and try again.', success: 'The operation was completed successfully.'
  }
};
