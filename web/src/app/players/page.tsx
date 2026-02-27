"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import RequireAuth from "@/components/require-auth";
import { formatFlagAmount } from "@/lib/format";

type PlayerRow = {
  id: string;
  name: string;
  seed_price: number;
  current_price: number;
  holder_count: number;
  invested_capital: number;
};

type PlayerMarketStatsRow = {
  result_player_id: string;
  result_holder_count: number;
  result_invested_capital: number;
};

export default function PlayersPage() {
  return (
    <main>
      <h1>Players</h1>
      <p>
        <Link href="/">Back to Home</Link>
      </p>
      <p>
        <Link href="/dashboard">Go to Dashboard</Link>
      </p>
      <p>
        <Link href="/opinion">Go to Daily Opinion</Link>
      </p>
      <p>
        <Link href="/vote">Go to Vote</Link>
      </p>
      <p>
        <Link href="/admin">Go to Admin</Link>
      </p>
      <p>
        <Link href="/orders">Go to My Orders</Link>
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

      const playersQuery = supabase
        .from("players")
        .select("id,name,seed_price,current_price")
        .order("current_price", { ascending: false });
      const marketStatsQuery = supabase.rpc("get_player_market_stats");

      const [playersResult, marketStatsResult] = await Promise.all([
        playersQuery,
        marketStatsQuery
      ]);

      if (playersResult.error) {
        setError(playersResult.error.message);
        setLoading(false);
        return;
      }

      const playersData = (playersResult.data ?? []) as Omit<
        PlayerRow,
        "holder_count" | "invested_capital"
      >[];
      const marketStatsData = marketStatsResult.error
        ? []
        : ((marketStatsResult.data ?? []) as PlayerMarketStatsRow[]);
      const marketStatsByPlayerId = new Map(
        marketStatsData.map((row) => [row.result_player_id, row])
      );

      setPlayers(
        playersData.map((player) => ({
          ...player,
          holder_count:
            marketStatsByPlayerId.get(player.id)?.result_holder_count ?? 0,
          invested_capital:
            marketStatsByPlayerId.get(player.id)?.result_invested_capital ?? 0
        }))
      );
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
                <th>Holders</th>
                <th>Planted Capital</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>
                    <Link href={`/players/${player.id}`}>{player.name}</Link>
                  </td>
                  <td>{formatFlagAmount(player.seed_price)}</td>
                  <td>{formatFlagAmount(player.current_price)}</td>
                  <td>{player.holder_count}</td>
                  <td>{formatFlagAmount(player.invested_capital)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
