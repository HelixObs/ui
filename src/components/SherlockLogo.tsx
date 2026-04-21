interface Props {
  className?: string;
  size?: number;
}

export default function SherlockLogo({ className = "", size = 24 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Lens */}
      <circle cx="20" cy="20" r="13" stroke="currentColor" strokeWidth="4.5" />
      {/* Inner gleam */}
      <circle cx="15" cy="15" r="3" fill="currentColor" opacity="0.25" />
      {/* Handle */}
      <line x1="30" y1="30" x2="43" y2="43" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
