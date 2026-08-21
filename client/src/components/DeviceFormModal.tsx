import { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import type { Device, DeviceType, PricingTier } from '../types';

export interface ConsolePreset {
  id: string;
  labelAr: string;
  labelEn: string;
  badge: string;
  defaultSingleRate: number;
  defaultMultiRate: number;
  defaultControllers: string;
  defaultScreen: string;
}

export const CONSOLE_PRESETS: ConsolePreset[] = [
  {
    id: 'ps5',
    labelAr: 'PlayStation 5 (PS5)',
    labelEn: 'PlayStation 5 (PS5)',
    badge: 'PS5',
    defaultSingleRate: 50,
    defaultMultiRate: 70,
    defaultControllers: '2 أذرع DualSense',
    defaultScreen: 'شاشة 55" 4K 120Hz',
  },
  {
    id: 'ps4',
    labelAr: 'PlayStation 4 (PS4 Pro / Slim)',
    labelEn: 'PlayStation 4 (PS4 Pro / Slim)',
    badge: 'PS4',
    defaultSingleRate: 30,
    defaultMultiRate: 45,
    defaultControllers: '2 أذرع DualShock 4',
    defaultScreen: 'شاشة 50" Full HD',
  },
  {
    id: 'ps3',
    labelAr: 'PlayStation 3 (PS3)',
    labelEn: 'PlayStation 3 (PS3)',
    badge: 'PS3',
    defaultSingleRate: 20,
    defaultMultiRate: 30,
    defaultControllers: '2 أذرع DualShock 3',
    defaultScreen: 'شاشة 43" HD',
  },
  {
    id: 'xbox_series',
    labelAr: 'Xbox Series X / Series S',
    labelEn: 'Xbox Series X / Series S',
    badge: 'XBOX-X/S',
    defaultSingleRate: 45,
    defaultMultiRate: 65,
    defaultControllers: '2 أذرع Xbox Wireless',
    defaultScreen: 'شاشة 55" 4K 120Hz',
  },
  {
    id: 'xbox_one',
    labelAr: 'Xbox One / One S',
    labelEn: 'Xbox One / One S',
    badge: 'XBOX-ONE',
    defaultSingleRate: 25,
    defaultMultiRate: 35,
    defaultControllers: '2 أذرع Xbox Controller',
    defaultScreen: 'شاشة 50" Full HD',
  },
  {
    id: 'switch',
    labelAr: 'Nintendo Switch / OLED',
    labelEn: 'Nintendo Switch / OLED',
    badge: 'SWITCH',
    defaultSingleRate: 30,
    defaultMultiRate: 40,
    defaultControllers: '4 أذرع Joy-Con / Pro',
    defaultScreen: 'شاشة 43" Full HD',
  },
  {
    id: 'custom',
    labelAr: 'طراز كونسول مخصص...',
    labelEn: 'Custom Console Model...',
    badge: 'CONSOLE',
    defaultSingleRate: 35,
    defaultMultiRate: 50,
    defaultControllers: '2 أذرع تحكم',
    defaultScreen: 'شاشة ألعاب',
  },
];

interface DeviceFormModalProps {
  title: string;
  initial: Device | null;
  existingDevices?: Device[];
  onClose: () => void;
  onDone: (patch: Record<string, unknown>) => void;
}

export function DeviceFormModal({
  title,
  initial,
  existingDevices = [],
  onClose,
  onDone,
}: DeviceFormModalProps) {
  const { t, language, isRtl } = useLanguage();
  const isAr = language === 'ar';

  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<DeviceType>(initial?.type ?? 'console');

  // Console specific states
  const initialSpecs = (initial?.specs as Record<string, string>) || {};
  const [consoleModelId, setConsoleModelId] = useState<string>(() => {
    if (initial?.specs?.model_id) return initial.specs.model_id;
    const lowerName = (initial?.name || '').toLowerCase();
    if (lowerName.includes('ps5') || lowerName.includes('5')) return 'ps5';
    if (lowerName.includes('ps4') || lowerName.includes('4')) return 'ps4';
    if (lowerName.includes('ps3') || lowerName.includes('3')) return 'ps3';
    if (lowerName.includes('xbox') && (lowerName.includes('series') || lowerName.includes('x') || lowerName.includes('s'))) return 'xbox_series';
    if (lowerName.includes('xbox')) return 'xbox_one';
    if (lowerName.includes('switch') || lowerName.includes('nintendo')) return 'switch';
    return 'ps5';
  });

  const [customConsoleModel, setCustomConsoleModel] = useState(initialSpecs.custom_model || '');
  const [hourlyRate, setHourlyRate] = useState(String(initial?.hourly_rate ?? ''));
  const [hourlyRateMulti, setHourlyRateMulti] = useState(String(initial?.hourly_rate_multi ?? ''));

  // Specs states
  const [specsCpu, setSpecsCpu] = useState(initialSpecs.CPU || '');
  const [specsGpu, setSpecsGpu] = useState(initialSpecs.GPU || '');
  const [specsRam, setSpecsRam] = useState(initialSpecs.RAM || '');
  const [specsMonitor, setSpecsMonitor] = useState(initialSpecs.Monitor || initialSpecs.screen || '');
  const [specsControllers, setSpecsControllers] = useState(initialSpecs.controllers || '');
  const [specsGames, setSpecsGames] = useState(initialSpecs.games || '');
  const [specsTableSize, setSpecsTableSize] = useState(initialSpecs.table_size || '');

  const [loading, setLoading] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<Record<string, { rate: number; rateMulti: number }>>({});

  // Helper to find past rates for this exact console model
  const getPresetForConsole = (cId: string) => {
    // 1. Try to find a matching existing device with this console model
    const match = existingDevices.find(
      (d) => d.type === 'console' && (d.specs?.model_id === cId || d.name.toLowerCase().includes(cId))
    );
    if (match) {
      return { rate: match.hourly_rate, rateMulti: match.hourly_rate_multi };
    }
    // 2. Otherwise use hardcoded default preset
    const preset = CONSOLE_PRESETS.find((p) => p.id === cId);
    if (preset) {
      return { rate: preset.defaultSingleRate, rateMulti: preset.defaultMultiRate };
    }
    return null;
  };

  useEffect(() => {
    async function loadPricing() {
      try {
        const tiers = await dataService.getPricing();
        const map: Record<string, { rate: number; rateMulti: number }> = {};
        tiers.forEach((tier: PricingTier) => {
          map[tier.type] = { rate: tier.hourly_rate, rateMulti: tier.hourly_rate_multi };
        });
        setPricingTiers(map);

        if (!initial) {
          if (type === 'console') {
            const cPreset = getPresetForConsole(consoleModelId);
            if (cPreset) {
              setHourlyRate(String(cPreset.rate));
              setHourlyRateMulti(String(cPreset.rateMulti));
            }
          } else {
            const defaultTier = map[type] || existingDevices.find((d) => d.type === type);
            if (defaultTier) {
              setHourlyRate(String(defaultTier.rate || (defaultTier as any).hourly_rate));
              setHourlyRateMulti(String(defaultTier.rateMulti || (defaultTier as any).hourly_rate_multi));
            }
          }
        }
      } catch {
        if (!initial) {
          if (type === 'console') {
            const cPreset = getPresetForConsole(consoleModelId);
            if (cPreset) {
              setHourlyRate(String(cPreset.rate));
              setHourlyRateMulti(String(cPreset.rateMulti));
            }
          }
        }
      }
    }
    loadPricing();
  }, []);

  const handleTypeChange = (newType: DeviceType) => {
    setType(newType);
    if (!initial) {
      if (newType === 'console') {
        const preset = getPresetForConsole(consoleModelId);
        if (preset) {
          setHourlyRate(String(preset.rate));
          setHourlyRateMulti(String(preset.rateMulti));
        }
        if (!name) {
          setName(consoleModelId === 'ps5' ? 'PS5 - 01' : consoleModelId === 'ps4' ? 'PS4 - 01' : 'Console - 01');
        }
      } else {
        const tier = pricingTiers[newType] || existingDevices.find((d) => d.type === newType);
        if (tier) {
          setHourlyRate(String((tier as any).rate ?? (tier as any).hourly_rate));
          setHourlyRateMulti(String((tier as any).rateMulti ?? (tier as any).hourly_rate_multi));
        }
        if (!name || name.startsWith('PS') || name.startsWith('Console')) {
          setName(newType === 'pc' ? 'PC - 01' : newType === 'table' ? 'بلياردو 1' : 'VR - 01');
        }
      }
    }
  };

  const handleConsoleModelChange = (newModelId: string) => {
    setConsoleModelId(newModelId);
    const preset = CONSOLE_PRESETS.find((p) => p.id === newModelId);
    const ratePreset = getPresetForConsole(newModelId);

    if (ratePreset) {
      setHourlyRate(String(ratePreset.rate));
      setHourlyRateMulti(String(ratePreset.rateMulti));
    }

    if (preset) {
      if (!specsControllers) setSpecsControllers(preset.defaultControllers);
      if (!specsMonitor) setSpecsMonitor(preset.defaultScreen);
    }

    // Auto-update name suggestion if user hasn't customized heavily
    if (!initial) {
      if (newModelId === 'ps5') setName('PS5 - 01');
      else if (newModelId === 'ps4') setName('PS4 - 01');
      else if (newModelId === 'ps3') setName('PS3 - 01');
      else if (newModelId.startsWith('xbox')) setName('Xbox - 01');
      else if (newModelId === 'switch') setName('Switch - 01');
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const rate = parseFloat(hourlyRate || '0');
      const rateMulti = parseFloat(hourlyRateMulti || '0');
      if (Number.isNaN(rate) || rate < 0 || Number.isNaN(rateMulti) || rateMulti < 0) {
        throw new Error(isAr ? 'برجاء إدخال سعر صحيح للساعة' : 'Invalid hourly rate');
      }

      const specs: Record<string, string> = {};

      if (type === 'console') {
        specs.model_id = consoleModelId;
        const selectedPreset = CONSOLE_PRESETS.find((p) => p.id === consoleModelId);
        specs.model = consoleModelId === 'custom' ? customConsoleModel || 'Custom' : selectedPreset?.badge || 'CONSOLE';
        specs.model_label = consoleModelId === 'custom' ? customConsoleModel || 'Custom' : selectedPreset?.labelAr || 'Console';
        if (customConsoleModel) specs.custom_model = customConsoleModel;
        if (specsControllers) specs.controllers = specsControllers;
        if (specsMonitor) specs.screen = specsMonitor;
        if (specsGames) specs.games = specsGames;
      } else if (type === 'pc') {
        if (specsCpu) specs.CPU = specsCpu;
        if (specsGpu) specs.GPU = specsGpu;
        if (specsRam) specs.RAM = specsRam;
        if (specsMonitor) specs.Monitor = specsMonitor;
      } else if (type === 'table') {
        if (specsTableSize) specs.table_size = specsTableSize;
        if (specsControllers) specs.cues = specsControllers;
      } else if (type === 'vr') {
        if (specsMonitor) specs.headset = specsMonitor;
        if (specsControllers) specs.controllers = specsControllers;
      }

      const patch: Record<string, unknown> = {
        name: name.trim(),
        type,
        hourly_rate: rate,
        hourly_rate_multi: rateMulti,
        specs: Object.keys(specs).length > 0 ? specs : null,
      };

      await onDone(patch);
    } catch (err) {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const isValid = name.trim() && !Number.isNaN(parseFloat(hourlyRate)) && !Number.isNaN(parseFloat(hourlyRateMulti));

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {t('cancel')}
          </Button>
          <Button
            loading={loading}
            disabled={!isValid}
            onClick={handleSubmit}
            style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
          >
            {initial ? t('save') : isAr ? 'تسجيل وحفظ الجهاز' : 'Add Device'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Device Name */}
        <Input
          label={isAr ? 'معرّف الجهاز (الاسم)' : 'Device Identifier / Name'}
          placeholder="e.g. PS5 - VIP 01, PC-05"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        {/* Category Type */}
        <Select
          label={isAr ? 'القسم / نوع الجهاز' : 'Device Category'}
          value={type}
          onChange={(e) => handleTypeChange(e.target.value as DeviceType)}
        >
          <option value="console">{isAr ? 'منصة ألعاب كونسول (PlayStation / Xbox / Switch)' : 'Gaming Console'}</option>
          <option value="pc">{isAr ? 'كمبيوتر مكتبى (PC Gaming)' : 'PC Gaming'}</option>
          <option value="table">{isAr ? 'طاولة بلياردو / بينج بونج / سنوكر' : 'Billiards / Table'}</option>
          <option value="vr">{isAr ? 'واقع افتراضي (VR Station)' : 'VR Station'}</option>
        </Select>

        {/* ─── CONSOLE MODEL SELECTION & PRESETS ─── */}
        {type === 'console' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Select
              label={isAr ? 'موديل وإصدار الكونسول' : 'Console Generation & Model'}
              value={consoleModelId}
              onChange={(e) => handleConsoleModelChange(e.target.value)}
            >
              {CONSOLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {isAr ? preset.labelAr : preset.labelEn}
                </option>
              ))}
            </Select>

            {consoleModelId === 'custom' && (
              <Input
                label={isAr ? 'اسم طراز الكونسول المخصص' : 'Custom Console Model Name'}
                placeholder="e.g. Retro Arcade, PS5 Pro, Steam Deck Dock"
                value={customConsoleModel}
                onChange={(e) => setCustomConsoleModel(e.target.value)}
              />
            )}
          </div>
        )}

        {/* Hourly Rates (Single & Multi) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label={isAr ? 'سعر الساعة فردي (Single $)' : 'Single Rate ($/hr)'}
            type="number"
            step="0.5"
            min="0"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
          />
          <Input
            label={isAr ? 'سعر الساعة جماعي (Multi $)' : 'Multi Rate ($/hr)'}
            type="number"
            step="0.5"
            min="0"
            value={hourlyRateMulti}
            onChange={(e) => setHourlyRateMulti(e.target.value)}
          />
        </div>

        {/* ─── DYNAMIC HARDWARE & ACCESSORIES SPECS ─── */}
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px', marginTop: '4px' }}>
          <span className="ccms-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '10px' }}>
            {type === 'console'
              ? isAr ? 'مواصفات الشاشة والأذرع والألعاب (اختياري)' : 'Screen, Controllers & Games (Optional)'
              : type === 'pc'
              ? isAr ? 'مواصفات عتاد الكمبيوتر (اختياري)' : 'PC Hardware Specs (Optional)'
              : isAr ? 'ملحقات ومواصفات المحطة (اختياري)' : 'Station Specs (Optional)'}
          </span>
        </div>

        {type === 'console' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Input
              label={isAr ? 'أذرع التحكم المتوفرة' : 'Controllers'}
              placeholder={isAr ? 'مثال: 2 أذرع DualSense أصلية' : 'e.g. 2x DualSense Controllers'}
              value={specsControllers}
              onChange={(e) => setSpecsControllers(e.target.value)}
            />
            <Input
              label={isAr ? 'الشاشة الملحقة (TV / Monitor)' : 'Attached Screen / TV'}
              placeholder={isAr ? 'مثال: شاشة سامسونج 55 بوصة 4K 120Hz' : 'e.g. 55" Samsung 4K 120Hz'}
              value={specsMonitor}
              onChange={(e) => setSpecsMonitor(e.target.value)}
            />
            <Input
              label={isAr ? 'الألعاب المحملة / السعة' : 'Installed Games / Storage'}
              placeholder={isAr ? 'مثال: FIFA 25, PES, Spider-Man, GTA V' : 'e.g. FIFA 25, PES, GTA V'}
              value={specsGames}
              onChange={(e) => setSpecsGames(e.target.value)}
            />
          </div>
        )}

        {type === 'pc' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input label={isAr ? 'المعالج (CPU)' : 'CPU'} placeholder="e.g. i5-12400F / Ryzen 5" value={specsCpu} onChange={(e) => setSpecsCpu(e.target.value)} />
              <Input label={isAr ? 'كرت الشاشة (GPU)' : 'GPU'} placeholder="e.g. RTX 4060 8GB" value={specsGpu} onChange={(e) => setSpecsGpu(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input label={isAr ? 'الذاكرة (RAM)' : 'RAM'} placeholder="e.g. 16GB DDR4 3200MHz" value={specsRam} onChange={(e) => setSpecsRam(e.target.value)} />
              <Input label={isAr ? 'الشاشة الملحقة' : 'Monitor'} placeholder="e.g. 27'' 165Hz IPS" value={specsMonitor} onChange={(e) => setSpecsMonitor(e.target.value)} />
            </div>
          </div>
        )}

        {type === 'table' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Input
              label={isAr ? 'مقاس ونوع الطاولة' : 'Table Size & Type'}
              placeholder={isAr ? 'مثال: طاولة بلياردو برونزويك 9 قدم / سنوكر 12 قدم' : 'e.g. 9ft Brunswick / 12ft Snooker'}
              value={specsTableSize}
              onChange={(e) => setSpecsTableSize(e.target.value)}
            />
            <Input
              label={isAr ? 'العصي والكرات المرفقة' : 'Cues & Equipment'}
              placeholder={isAr ? 'مثال: 4 عصي كربون + طقم كرات أراميث أصلية' : 'e.g. 4x Carbon Cues + Aramith Ball Set'}
              value={specsControllers}
              onChange={(e) => setSpecsControllers(e.target.value)}
            />
          </div>
        )}

        {type === 'vr' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Input
              label={isAr ? 'موديل نظارة الواقع الافتراضي' : 'VR Headset Model'}
              placeholder={isAr ? 'مثال: Meta Quest 3 512GB / PlayStation VR2' : 'e.g. Meta Quest 3 / PS VR2'}
              value={specsMonitor}
              onChange={(e) => setSpecsMonitor(e.target.value)}
            />
            <Input
              label={isAr ? 'أدوات التحكم والمساحة' : 'Sensors & Controllers'}
              placeholder={isAr ? 'مثال: 2 Touch Plus Controllers + مساحة لعب 3x3 م' : 'e.g. 2x Controllers + 3x3m Play Area'}
              value={specsControllers}
              onChange={(e) => setSpecsControllers(e.target.value)}
            />
          </div>
        )}

      </div>
    </Modal>
  );
}
