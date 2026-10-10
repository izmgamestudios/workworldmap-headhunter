import { useEffect, useState } from 'react';
import type { HuntKind, HuntStatus, Place } from '../types';
import { KIND_META, STATUS_META } from '../types';
import { googlePlaceLink } from '../lib/gmaps';

interface Props {
  place: Place;
  inRoute: boolean;
  onChange: (p: Place) => void;
  onDelete: () => void;
  onToggleRoute: () => void;
  onClose: () => void;
}

export default function PlaceForm({ place, inRoute, onChange, onDelete, onToggleRoute, onClose }: Props) {
  // skills edited as raw text so typing commas/spaces is not eaten by re-splitting
  const [skillsText, setSkillsText] = useState(place.skills.join(', '));
  useEffect(() => setSkillsText(place.skills.join(', ')), [place.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Place>(k: K, v: Place[K]) => onChange({ ...place, [k]: v });
  const isTalent = place.kind === 'talent';

  return (
    <div className="form">
      <div className="row between">
        <h3>Kayıt Detayı</h3>
        <button className="icon" onClick={onClose} aria-label="Kapat">×</button>
      </div>

      <div className="seg">
        {(Object.keys(KIND_META) as HuntKind[]).map((k) => (
          <button key={k} className={place.kind === k ? 'on' : ''} onClick={() => set('kind', k)}>
            {KIND_META[k].label}
          </button>
        ))}
      </div>

      <label className="field">
        <span>{isTalent ? 'Ad Soyad' : 'İşletme Adı'}</span>
        <input value={place.name} onChange={(e) => set('name', e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>{isTalent ? 'Meslek / Rol / Pozisyon' : 'Aranan Pozisyon / Hedef'}</span>
        <input value={place.role} onChange={(e) => set('role', e.target.value)} placeholder={isTalent ? 'Kıdemli Yapay Zeka Mühendisi' : 'CNC Operatörü aranıyor'} />
      </label>
      <label className="field">
        <span>Yetenekler (virgülle)</span>
        <input
          value={skillsText}
          onChange={(e) => {
            setSkillsText(e.target.value);
            set('skills', e.target.value.split(',').map((s) => s.trim()).filter(Boolean));
          }}
          placeholder="Python, Mikro Kaynak, Organik Tarım"
        />
      </label>
      <label className="field">
        <span>Sektör / İşletme Türü</span>
        <input value={place.sector} onChange={(e) => set('sector', e.target.value)} />
      </label>
      <label className="field">
        <span>Avcılık Durumu</span>
        <select value={place.status} onChange={(e) => set('status', e.target.value as HuntStatus)}>
          {(Object.keys(STATUS_META) as HuntStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>İletişim</span>
        <input value={place.contact} onChange={(e) => set('contact', e.target.value)} placeholder="Telefon / e-posta" />
      </label>
      <label className="field">
        <span>Adres</span>
        <input value={place.address} onChange={(e) => set('address', e.target.value)} />
      </label>
      <label className="field">
        <span>Notlar</span>
        <textarea rows={3} value={place.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>

      <p className="hint mono">
        {place.lat.toFixed(5)}, {place.lng.toFixed(5)} · konumu değiştirmek için işaretçiyi sürükleyin
      </p>

      <div className="row wrap">
        <button className={inRoute ? '' : 'primary'} onClick={onToggleRoute}>
          {inRoute ? 'Rotadan çıkar' : 'Rotaya ekle'}
        </button>
        <a className="btn" href={googlePlaceLink(place)} target="_blank" rel="noopener noreferrer">
          Google Maps
        </a>
        <button
          className="danger"
          onClick={() => {
            if (window.confirm(`"${place.name || 'İsimsiz'}" silinsin mi?`)) onDelete();
          }}
        >
          Sil
        </button>
      </div>
    </div>
  );
}
