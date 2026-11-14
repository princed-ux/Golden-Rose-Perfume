# Workspace calculator design

The workspace can share a small calculator panel across the desktop toolbar and mobile quick actions. Open it with a labeled button, support keyboard input and Escape, and return focus to the opener. Display the current expression, result, and validation errors. Keep scratch work in component state. Opening or using it performs no catalogue, payment, or inventory writes.

The arithmetic module should accept a bounded sequence of numbers and explicit operators (+, −, ×, ÷), with decimal input, clear, and backspace. Use a tokenizer and an explicit precedence evaluator. Handle division by zero, invalid input, precision limits, and overflow. Format values for the user's locale. Keep evaluation separate from the panel so it can be tested without rendering the workspace.

For POS, add a separate pure calculation function that accepts currency, quantity, unit price in minor units, authorized discount, a tax policy, and tendered amount. Multiply quantity × unit price, apply discounts, calculate tax under the configured inclusive or exclusive rule, and return the subtotal, discount, tax, total, outstanding amount, and change. Keep NGN amounts in integer kobo and make the rounding rule explicit at the line or basket boundary. Reject negative or overflowing totals and distinguish underpayment from change. Test decimal entry, half-cent rounding rules, limits, and agreement between line and basket totals before enabling POS use.

The server must recompute checkout totals from trusted prices and approved discounts before a future POS transaction is recorded. The calculator is an input and preview component. Financial posting and inventory changes stay in their respective authorized transaction workflows.
