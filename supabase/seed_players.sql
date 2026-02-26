-- Seed 50 NBA players with initial prices for FlagPlant MVP.
-- Idempotent upsert by unique player name.

insert into public.players (name, seed_price, current_price)
values
  ('Nikola Jokic', 500, 500),
  ('Shai-Gilgeous Alexander', 470, 470),
  ('Victor Wembanyama', 445, 445),
  ('Luka Doncic', 420, 420),
  ('Giannis Antetokounmpo', 395, 395),
  ('Jayson Tatum', 382, 382),
  ('Anthony Edwards', 370, 370),
  ('Kawhi Leonard', 350, 350),
  ('Steph Curry', 330, 330),
  ('Cade Cunningham', 312, 312),
  ('Donovan Mitchell', 295, 295),
  ('Jaylen Brown', 278, 278),
  ('Tyrese Haliburton', 270, 270),
  ('Jalen Brunson', 262, 262),
  ('Tyrese Maxey', 247, 247),
  ('Kevin Durant', 233, 233),
  ('Jamal Murray', 220, 220),
  ('Devin Booker', 208, 208),
  ('Scottie Barnes', 197, 197),
  ('James Harden', 186, 186),
  ('Deni Avdija', 176, 176),
  ('Jalen Johnson', 167, 167),
  ('Chet Holmgren', 159, 159),
  ('Alperen Sengun', 151, 151),
  ('Evan Mobley', 144, 144),
  ('Pascal Siakam', 137, 137),
  ('LeBron James', 131, 131),
  ('Jalen Duren', 125, 125),
  ('Lauri Markannen', 120, 120),
  ('Bam Adebayo', 115, 115),
  ('De-Aaron Fox', 110, 110),
  ('Jalen Williams', 105, 105),
  ('Karl-Anthony Towns', 101, 101),
  ('Julius Randle', 97, 97),
  ('Derrick White', 94, 94),
  ('Joel Embiid', 91, 91),
  ('Anthony Davis', 88, 88),
  ('Austin Reaves', 86, 86),
  ('Franz Wagner', 84, 84),
  ('Rudy Gobert', 82, 82),
  ('OG Anunoby', 80, 80),
  ('Kon Knueppel', 78, 78),
  ('Cooper Flagg', 76, 76),
  ('Paolo Banchero', 74, 74),
  ('Trey Murphy III', 72, 72),
  ('Amen Thompson', 70, 70),
  ('LaMelo Ball', 68, 68),
  ('Norm Powell', 66, 66),
  ('Zion Williamson', 64, 64),
  ('Aaron Gordon', 62, 62)
on conflict (name)
do update set
  seed_price = excluded.seed_price,
  current_price = excluded.current_price,
  updated_at = now();

-- Optional helper: set baseline capital from chosen total baseline pool.
-- Example: if expected initial user investable flags U0=5,000,
-- baseline pool B=20*U0 = 100,000.
-- update public.players p
-- set baseline_capital = 100000 * (p.seed_price / (select sum(seed_price) from public.players));
