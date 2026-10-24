import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Room not found</h1>
        <p className="mt-2 text-fg-muted">Check the code and try again.</p>
        <Link href="/" className="mt-6 inline-block text-accent">Go home</Link>
      </div>
    </main>
  );
}
