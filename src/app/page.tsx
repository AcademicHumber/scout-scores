import messages from "@/messages/es.json";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold">{messages.app.name}</h1>
        <p className="mt-4 text-lg text-gray-600">{messages.app.tagline}</p>
      </div>
    </main>
  );
}
