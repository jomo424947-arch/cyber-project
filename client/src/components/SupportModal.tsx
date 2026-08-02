import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
}

export function SupportModal({ open, onClose }: SupportModalProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const isAr = language === 'ar';

  const phone1 = '01032778056';
  const phone2 = '01098213323';

  const waUrl1 = `https://wa.me/201032778056?text=${encodeURIComponent(isAr ? 'مرحباً، أحتاج مساعدة في نظام إدارة السايبر' : 'Hello, I need support with CCMS system')}`;
  const waUrl2 = `https://wa.me/201098213323?text=${encodeURIComponent(isAr ? 'مرحباً، أحتاج مساعدة في نظام إدارة السايبر' : 'Hello, I need support with CCMS system')}`;

  const handleCopy = (num: string) => {
    navigator.clipboard.writeText(num);
    toast(isAr ? `تم نسخ رقم الدعم الفني (${num})` : `Copied ${num} to clipboard`, 'success');
  };

  return (
    <Modal
      open={open}
      title={isAr ? 'نظام الدعم الفني المباشر' : 'Technical Support Center'}
      onClose={onClose}
      width={540}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {isAr ? 'إغلاق' : 'Close'}
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Support Online Banner */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            background: 'rgba(0, 194, 255, 0.06)',
            border: '1px solid rgba(0, 194, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#00E5FF',
              boxShadow: '0 0 10px #00E5FF',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>
              {isAr ? 'فريق الدعم الفني متواجد الآن 24/7' : 'Support Team Online 24/7'}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
              {isAr
                ? 'جاهزون لمساعدتك في أي استفسار أو حل أي مشكلة تقنية فوراً'
                : 'Ready to assist with any inquiry or technical issue immediately'}
            </div>
          </div>
        </div>

        {/* 2 WhatsApp Contact Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Line 1 */}
          <a
            href={waUrl1}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '20px 16px',
              borderRadius: '12px',
              background: 'rgba(37, 211, 102, 0.08)',
              border: '1px solid rgba(37, 211, 102, 0.25)',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              color: '#25D366',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(37, 211, 102, 0.16)';
              e.currentTarget.style.borderColor = 'rgba(37, 211, 102, 0.4)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(37, 211, 102, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(37, 211, 102, 0.25)';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>
              chat
            </span>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                {isAr ? 'واتساب - خط الدعم 1' : 'WhatsApp Line 1'}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 800, color: 'var(--accent-green)', marginTop: '4px' }}>
                {phone1}
              </div>
            </div>
          </a>

          {/* Line 2 */}
          <a
            href={waUrl2}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '20px 16px',
              borderRadius: '12px',
              background: 'rgba(37, 211, 102, 0.08)',
              border: '1px solid rgba(37, 211, 102, 0.25)',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              color: 'var(--accent-green)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(37, 211, 102, 0.16)';
              e.currentTarget.style.borderColor = 'rgba(37, 211, 102, 0.4)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(37, 211, 102, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(37, 211, 102, 0.25)';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>
              chat
            </span>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                {isAr ? 'واتساب - خط الدعم 2' : 'WhatsApp Line 2'}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 800, color: 'var(--accent-green)', marginTop: '4px' }}>
                {phone2}
              </div>
            </div>
          </a>
        </div>

        {/* 2 Phone Numbers Hotline list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Hotline 1 */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent-green)', fontSize: '22px' }}>
                call
              </span>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {isAr ? 'خط الاتصال المباشر 1' : 'Direct Support Hotline 1'}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {phone1}
                </div>
              </div>
            </div>
            <Button variant="ghost" onClick={() => handleCopy(phone1)} style={{ padding: '6px 12px', fontSize: '12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
              {isAr ? 'نسخ' : 'Copy'}
            </Button>
          </div>

          {/* Hotline 2 */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: '22px' }}>
                call
              </span>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {isAr ? 'خط الاتصال المباشر 2' : 'Direct Support Hotline 2'}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {phone2}
                </div>
              </div>
            </div>
            <Button variant="ghost" onClick={() => handleCopy(phone2)} style={{ padding: '6px 12px', fontSize: '12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
              {isAr ? 'نسخ' : 'Copy'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
