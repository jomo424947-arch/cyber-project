import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import type { User } from '../types';

export default function EmployeesPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { t, language } = useLanguage();
  const { data: employees, loading, refetch } = useAsync(() => dataService.listEmployees(), []);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);

  const allEmployees = employees ?? [];

  return (
    <Layout
      title={t('employees_title')}
      subtitle={t('employees_subtitle')}
      actions={
        <Button 
          onClick={() => setCreating(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          {t('add_employee')}
        </Button>
      }
    >
      {loading ? (
        <LoadingSpinner label={t('loading')} />
      ) : allEmployees.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="badge"
            title={language === 'ar' ? 'لم يتم العثور على موظفين' : 'No employees found'}
            description={language === 'ar' ? 'أضف موظفك الأول لمنحه حق الوصول إلى النظام.' : 'Add your first employee to grant them terminal access.'}
            action={<Button onClick={() => setCreating(true)}>{t('add_employee')}</Button>}
          />
        </div>
      ) : (
        <>
          <Card style={{ overflow: 'hidden', marginBottom: '24px' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)' }}>
              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {language === 'ar' ? 'سجل الموظفين النشطين' : 'Active Staff Registry'}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                {allEmployees.length} {language === 'ar' ? 'موظف مسجل حالياً' : `employee${allEmployees.length === 1 ? '' : 's'} registered in this tenant`}
              </p>
            </div>
            <Table
              columns={[
                {
                  key: 'full_name',
                  header: t('employee_name'),
                  render: (emp: User) => (
                    <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                        person
                      </span>
                      {emp.full_name || emp.email.split('@')[0]}
                    </strong>
                  ),
                },
                {
                  key: 'email',
                  header: language === 'ar' ? 'البريد الإلكتروني' : 'Email Address',
                  render: (emp: User) => (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {emp.email}
                    </span>
                  ),
                },
                {
                  key: 'role',
                  header: t('role'),
                  render: (emp: User) => (
                    <span 
                      style={{ 
                        textTransform: 'uppercase',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: emp.role === 'admin' ? 'rgba(0, 194, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                        color: emp.role === 'admin' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      }}
                    >
                      {emp.role === 'admin' ? t('administrator') : t('staff_operator')}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (emp: User) => (
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button
                        variant="ghost"
                        onClick={() => setEditing(emp)}
                        style={{ padding: '6px 14px', fontSize: '11px', minHeight: '32px' }}
                      >
                        {t('edit')}
                      </Button>
                      {currentUser?.id !== emp.id && (
                        <Button
                          variant="danger"
                          onClick={() => setDeleting(emp)}
                          style={{ padding: '6px 14px', fontSize: '11px', minHeight: '32px' }}
                        >
                          {t('delete')}
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              data={allEmployees}
              rowKey={(emp) => emp.id}
            />
          </Card>
        </>
      )}

      {/* Edit modal */}
      {editing && (
        <EmployeeFormModal
          title={language === 'ar' ? `تعديل بيانات الموظف · ${editing.email}` : `Edit Employee · ${editing.email}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={async (patch) => {
            try {
              await dataService.updateEmployee(editing.id, patch);
              toast(language === 'ar' ? 'تم تحديث بيانات الموظف بنجاح' : 'Employee profile updated', 'success');
              refetch();
              setEditing(null);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not update employee'), 'error');
            }
          }}
        />
      )}

      {/* Create modal */}
      {creating && (
        <EmployeeFormModal
          title={t('add_employee')}
          initial={null}
          onClose={() => setCreating(false)}
          onDone={async (patch) => {
            try {
              await dataService.createEmployee(patch);
              toast(language === 'ar' ? 'تم إضافة الموظف الجديد بنجاح' : 'New employee added', 'success');
              refetch();
              setCreating(false);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not create employee'), 'error');
            }
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <Modal
          open
          title={t('delete_employee')}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>{t('cancel')}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await dataService.deleteEmployee(deleting.id);
                    toast(language === 'ar' ? 'تم حذف الموظف بنجاح' : 'Employee removed successfully', 'success');
                    refetch();
                    setDeleting(null);
                  } catch (err) {
                    toast(apiErrorMessage(err, 'Could not delete employee'), 'error');
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            {t('delete_employee_confirm', { name: deleting.full_name || deleting.email })}
          </p>
        </Modal>
      )}
    </Layout>
  );
}

function EmployeeFormModal({
  title,
  initial,
  onClose,
  onDone,
}: {
  title: string;
  initial: User | null;
  onClose: () => void;
  onDone: (patch: Record<string, unknown>) => void;
}) {
  const [email, setEmail] = useState(initial?.email ?? '');
  const [fullName, setFullName] = useState(initial?.full_name ?? '');
  const [role, setRole] = useState<'admin' | 'staff'>(initial?.role as 'admin' | 'staff' ?? 'staff');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { t, language } = useLanguage();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const patch: Record<string, unknown> = {
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role,
      };
      // Password is required for creating, optional for updating
      if (password) {
        patch.password = password;
      }
      await onDone(patch);
    } catch (err) {
      // Handled by parent
    } finally {
      setLoading(false);
    }
  };

  const isValid = 
    email.trim() &&
    fullName.trim() &&
    (initial ? true : password.length >= 6); // Require password only for new user

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button loading={loading} disabled={!isValid} onClick={handleSubmit}>
            {initial ? t('save') : t('add_employee')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input 
          label={language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'} 
          placeholder="employee@cafe.com" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          disabled={!!initial}
          autoFocus={!initial} 
        />
        <Input 
          label={t('employee_name')} 
          placeholder="e.g. Ahmed Salem" 
          value={fullName} 
          onChange={(e) => setFullName(e.target.value)}
          autoFocus={!!initial} 
        />
        <Select 
          label={t('role')} 
          value={role} 
          onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}
        >
          <option value="staff">{t('staff_operator')}</option>
          <option value="admin">{t('administrator')}</option>
        </Select>
        <Input 
          label={initial ? t('password_optional') : t('password')} 
          type="password" 
          placeholder={initial ? t('password_keep') : t('password_placeholder')} 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
        />
      </div>
    </Modal>
  );
}
