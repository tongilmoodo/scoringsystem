export default function Logo({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img 
      src="/logo.png" 
      alt="Tong-Il Moo-Do" 
      width={size} 
      height={size} 
      className="object-contain"
    />
  );
}
