import logo from "../assets/jn-logo.jpeg";

interface LogoProps {
  size?: "sm" | "md" | "lg";
}

export function Logo({ size = "md" }: LogoProps) {
  const sizes = {
    sm: "w-32",
    md: "w-44",
    lg: "w-64",
  };

  return (
    <div className="flex items-center justify-center">
      <img
        src={logo}
        alt="J&N Decorações em Gesso"
        className={`${sizes[size]} h-auto object-contain`}
      />
    </div>
  );
}
