-- Drop the tables left behind by the 33 scaffold models deleted in 0305ac1b
-- (app/Models/{commerce,Content,realtime}). No model describes them, no app
-- code queries them, and every one was empty: 0 rows across all 33 at the
-- time this was written.
--
-- IF EXISTS because the create-table migrations are removed in the same
-- commit, so a database built from scratch never has them and must not fail
-- here.

DROP TABLE IF EXISTS "authors";
DROP TABLE IF EXISTS "cart_items";
DROP TABLE IF EXISTS "carts";
DROP TABLE IF EXISTS "categories";
DROP TABLE IF EXISTS "coupons";
DROP TABLE IF EXISTS "customers";
DROP TABLE IF EXISTS "delivery_routes";
DROP TABLE IF EXISTS "digital_deliveries";
DROP TABLE IF EXISTS "drivers";
DROP TABLE IF EXISTS "gift_cards";
DROP TABLE IF EXISTS "license_keys";
DROP TABLE IF EXISTS "loyalty_points";
DROP TABLE IF EXISTS "loyalty_rewards";
DROP TABLE IF EXISTS "manufacturers";
DROP TABLE IF EXISTS "order_items";
DROP TABLE IF EXISTS "orders";
DROP TABLE IF EXISTS "pages";
DROP TABLE IF EXISTS "payments";
DROP TABLE IF EXISTS "posts";
DROP TABLE IF EXISTS "print_devices";
DROP TABLE IF EXISTS "product_units";
DROP TABLE IF EXISTS "product_variants";
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "receipts";
DROP TABLE IF EXISTS "reviews";
DROP TABLE IF EXISTS "shipping_methods";
DROP TABLE IF EXISTS "shipping_rates";
DROP TABLE IF EXISTS "shipping_zones";
DROP TABLE IF EXISTS "tax_rates";
DROP TABLE IF EXISTS "transactions";
DROP TABLE IF EXISTS "waitlist_products";
DROP TABLE IF EXISTS "waitlist_restaurants";
DROP TABLE IF EXISTS "websockets";
