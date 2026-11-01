import { useEffect, useState } from 'react';

export function App() {
  const [health, setHealth] = useState<{ status: string; version: string } | null>(null);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-primary-700">Inventopedia</h1>
        <p className="text-gray-600">Universal Inventory Management</p>
        {health ? (
          <p className="text-sm text-green-600">
            API: {health.status} (v{health.version})
          </p>
        ) : (
          <p className="text-sm text-gray-400">Connecting to API...</p>
        )}
      </div>
    </div>
  );
}

