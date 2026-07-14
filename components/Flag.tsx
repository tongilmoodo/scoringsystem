import { countryName, getFlagEmoji, getFlagUrl } from '@/lib/countries';

/**
 * Country flag. Defaults to the self-hosted SVG (crisp and consistent on
 * scoreboard TVs). Pass emoji for compact spots like table rows.
 */
export default function Flag({
  code,
  size = 20,
  emoji = false,
}: {
  code: string | null | undefined;
  size?: number;
  emoji?: boolean;
}) {
  if (!code) return null;
  const name = countryName(code);
  if (emoji) {
    return (
      <span title={name} aria-label={name}>
        {getFlagEmoji(code)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={getFlagUrl(code)}
      alt={name}
      title={name}
      width={size}
      height={Math.round((size * 2) / 3)}
      className="inline-block rounded-[2px] align-middle"
    />
  );
}
