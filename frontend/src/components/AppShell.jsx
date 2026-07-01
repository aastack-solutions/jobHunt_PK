import Navbar from './Navbar';

// Consistent chrome for every authenticated page: glass navbar on the gradient
// backdrop (set on body), plus a centered content container with entrance motion.
export default function AppShell({ children }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
