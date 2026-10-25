import { useState } from "react";
import {
  addItem, decrementItem, EMPTY_CART, formatPrice, itemCount, MENU, removeLine, totals, type Cart, type Category,
} from "./menu";

const CATEGORIES: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "coffee", label: "Coffee" },
  { id: "tea", label: "Tea" },
  { id: "bakery", label: "Bakery" },
];

const TAG_LABEL = { vegan: "🌱 Vegan", "gluten-free": "🌾 Gluten-free" } as const;

export default function App() {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [category, setCategory] = useState<Category | "all">("all");
  const [order, setOrder] = useState<string | null>(null);
  const items = MENU.filter((m) => category === "all" || m.category === category);
  const count = itemCount(cart);
  const t = totals(cart);

  function checkout() {
    setOrder(`A${Math.floor(10 + Math.random() * 89)}`);
    setCart(EMPTY_CART);
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Order ahead · skip the line</p>
        <h1>Harbour Café</h1>
        <p className="tagline">Specialty coffee and fresh bakes by the water.</p>
      </header>

      <nav className="tabs" aria-label="Menu categories">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={category === c.id ? "tab active" : "tab"} aria-pressed={category === c.id} onClick={() => setCategory(c.id)} data-testid={`category-${c.id}`}>
            {c.label}
          </button>
        ))}
      </nav>

      <main className="menu" data-testid="menu">
        {items.map((m) => (
          <article key={m.id} className="item" data-testid={`menu-item-${m.id}`}>
            <span className="emoji" aria-hidden>{m.emoji}</span>
            <div className="info">
              <h2>{m.name}</h2>
              <p>{m.description}</p>
              {m.tags.length > 0 && (
                <ul className="tags">{m.tags.map((tag) => <li key={tag}>{TAG_LABEL[tag]}</li>)}</ul>
              )}
            </div>
            <div className="buy">
              <span className="price">{formatPrice(m.price)}</span>
              <button className="add" onClick={() => setCart((c) => addItem(c, m.id))} data-testid={`add-${m.id}`} aria-label={`Add ${m.name}`}>Add</button>
            </div>
          </article>
        ))}
      </main>

      {order && (
        <div className="confirm" role="status" data-testid="order-confirmation">
          <strong>Order {order} placed ☕</strong>
          <span>Ready in about 5 minutes at the pickup counter.</span>
          <button onClick={() => setOrder(null)}>OK</button>
        </div>
      )}

      <aside className="cart" aria-label="Your order" data-testid="cart">
        <div className="cart-head">
          <h2>Your order</h2>
          <span className="count" data-testid="cart-count">{count} {count === 1 ? "item" : "items"}</span>
        </div>
        {cart.lines.length === 0 ? (
          <p className="empty">Nothing here yet. Add something tasty.</p>
        ) : (
          <ul className="lines">
            {cart.lines.map((l) => {
              const m = MENU.find((x) => x.id === l.id)!;
              return (
                <li key={l.id} data-testid={`cart-line-${l.id}`}>
                  <span className="line-name">{m.emoji} {m.name}</span>
                  <span className="qty">
                    <button onClick={() => setCart((c) => decrementItem(c, l.id))} aria-label={`One less ${m.name}`} data-testid={`dec-${l.id}`}>−</button>
                    <span data-testid={`qty-${l.id}`}>{l.qty}</span>
                    <button onClick={() => setCart((c) => addItem(c, l.id))} aria-label={`One more ${m.name}`} data-testid={`inc-${l.id}`}>+</button>
                  </span>
                  <button className="remove" onClick={() => setCart((c) => removeLine(c, l.id))} aria-label={`Remove ${m.name}`} data-testid={`remove-${l.id}`}>×</button>
                </li>
              );
            })}
          </ul>
        )}
        <dl className="sums">
          <div><dt>Subtotal</dt><dd data-testid="cart-subtotal">{formatPrice(t.subtotal)}</dd></div>
          <div><dt>Tax</dt><dd>{formatPrice(t.tax)}</dd></div>
          <div className="total"><dt>Total</dt><dd data-testid="cart-total">{formatPrice(t.total)}</dd></div>
        </dl>
        <button className="checkout" disabled={count === 0} onClick={checkout} data-testid="checkout">Place order</button>
      </aside>
    </div>
  );
}
