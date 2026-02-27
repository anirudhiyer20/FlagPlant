"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import RequireAuth from "@/components/require-auth";

type PlayerRow = {
  id: string;
  name: string;
  seed_price: number;
  current_price: number;
};

export default function PlayersPage() {
  return (
    <main>
      <h1>Players</h1>
      <p>
        <Link href="/">Back to Home</Link>
      </p>
      <p>
        <Link href="/opinion">Go to Daily Opinion</Link>
      </p>
      <p>
        <Link href="/vote">Go to Vote</Link>
      </p>
      <RequireAuth>{() => <PlayersTable />}</RequireAuth>
    </main>
  );
}

function PlayersTable() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPlayers() {
      setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("players")
        .select("id,name,seed_price,current_price")
        .order("current_price", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      setPlayers((data ?? []) as PlayerRow[]);
      setLoading(false);
    }

    loadPlayers().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown error";
      setError(msg);
      setLoading(false);
    });
  }, [supabase]);

  return (
    <div className="card">
      {loading ? <p>Loading players...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <p className="muted">Loaded players: {players.length}</p>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Seed Price</th>
                <th>Current Price</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.seed_price}</td>
                  <td>{player.current_price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
