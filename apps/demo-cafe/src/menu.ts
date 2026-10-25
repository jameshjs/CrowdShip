export type Category = "coffee" | "tea" | "bakery";
export type Tag = "vegan" | "gluten-free";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number; // cents
  category: Category;
  emoji: string;
  tags: Tag[];
}

export const MENU: MenuItem[] = [
  { id: "flat-white", name: "Flat white", description: "Double ristretto, silky milk", price: 450, category: "coffee", emoji: "☕", tags: ["gluten-free"] },
  { id: "oat-latte", name: "Oat latte", description: "Espresso with steamed oat milk", price: 500, category: "coffee", emoji: "🥛", tags: ["vegan", "gluten-free"] },
  { id: "cold-brew", name: "Cold brew", description: "Steeped 18 hours, served over ice", price: 475, category: "coffee", emoji: "🧊", tags: ["vegan", "gluten-free"] },
  { id: "matcha", name: "Matcha latte", description: "Ceremonial matcha, lightly sweet", price: 525, category: "tea", emoji: "🍵", tags: ["gluten-free"] },
  { id: "chai", name: "Spiced chai", description: "House blend with cinnamon and clove", price: 450, category: "tea", emoji: "🫖", tags: ["vegan", "gluten-free"] },
  { id: "croissant", name: "Butter croissant", description: "Flaky, baked this morning", price: 375, category: "bakery", emoji: "🥐", tags: [] },
  { id: "banana-bread", name: "Banana bread", description: "Toasted, with a pinch of sea salt", price: 400, category: "bakery", emoji: "🍌", tags: ["vegan"] },
  { id: "brownie", name: "Almond brownie", description: "Fudgy and flourless", price: 425, category: "bakery", emoji: "🍫", tags: ["gluten-free"] },
];

export const TAX_RATE = 0.08;

export interface CartLine {
  id: string;
  qty: number;
}

export interface Cart {
  lines: CartLine[];
  /** Running subtotal in cents, updated as the cart changes. */
  subtotal: number;
}

export const EMPTY_CART: Cart = { lines: [], subtotal: 0 };

export function priceOf(id: string): number {
  const item = MENU.find((m) => m.id === id);
  if (!item) throw new Error(`Unknown item ${id}`);
  return item.price;
}

export function addItem(cart: Cart, id: string): Cart {
  const line = cart.lines.find((l) => l.id === id);
  const lines = line ? cart.lines.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l)) : [...cart.lines, { id, qty: 1 }];
  return { lines, subtotal: cart.subtotal + priceOf(id) };
}

export function decrementItem(cart: Cart, id: string): Cart {
  const line = cart.lines.find((l) => l.id === id);
  if (!line) return cart;
  const lines = line.qty > 1 ? cart.lines.map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l)) : cart.lines.filter((l) => l.id !== id);
  return { lines, subtotal: cart.subtotal - priceOf(id) };
}

export function removeLine(cart: Cart, id: string): Cart {
  // Known issue (intentional, for the bug-report demo): the line is removed but its cost stays in the subtotal.
  return { ...cart, lines: cart.lines.filter((l) => l.id !== id) };
}

export function itemCount(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.qty, 0);
}

export function totals(cart: Cart): { subtotal: number; tax: number; total: number } {
  const tax = Math.round(cart.subtotal * TAX_RATE);
  return { subtotal: cart.subtotal, tax, total: cart.subtotal + tax };
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
