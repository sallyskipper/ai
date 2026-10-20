import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="stripe-bg absolute inset-0 opacity-50" />
      <div className="absolute top-[-20%] left-1/2 size-[560px] -translate-x-1/2 rounded-full bg-red/15 blur-[120px]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        {children}
      </div>
    </div>
  );
}
