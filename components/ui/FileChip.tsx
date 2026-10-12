import { Icon } from './Icon';

/** Wczytany plik: nazwa i opcjonalny rozmiar (sd-file). */
export function FileChip({ name, size }: { name: string; size?: string }) {
  return (
    <div className="sd-file">
      <Icon name="file" />
      <span className="sd-file__name">{name}</span>
      {size && (
        <span className="sd-muted sd-num" style={{ marginLeft: 'auto' }}>
          {size}
        </span>
      )}
    </div>
  );
}
