/// Standalone subtract function
int subtract(int a, int b) {
  return a - b;
}

/// Divides two numbers with error handling
double divide(double a, double b) {
  if (b == 0) {
    throw ArgumentError('Cannot divide by zero');
  }
  return a / b;
}

/// Formats a number as currency
String formatCurrency(double amount, {String symbol = '\$'}) {
  return '$symbol${amount.toStringAsFixed(2)}';
}
