/// Calculator class for basic arithmetic operations
class Calculator {
  /// Adds two numbers
  int add(int a, int b) {
    final result = a + b;
    return result;
  }

  /// Subtracts two numbers
  int subtract(int a, int b) {
    return a - b;
  }

  /// Multiplies two numbers
  int multiply(int a, int b) {
    return a * b;
  }
}

/// Helper class with static methods
class MathHelper {
  /// Calculates power
  static double power(double base, int exponent) {
    double result = 1;
    for (int i = 0; i < exponent; i++) {
      result *= base;
    }
    return result;
  }

  /// Calculates absolute value
  static double abs(double value) {
    return value < 0 ? -value : value;
  }
}

/// Main entry point
void main() {
  final calc = Calculator();

  // Test arithmetic operations
  final sum = calc.add(5, 3);
  final diff = calc.subtract(10, 4);
  final product = calc.multiply(6, 7);

  print('Sum: $sum');
  print('Difference: $diff');
  print('Product: $product');

  // Test helper methods
  final squared = MathHelper.power(2.0, 3);
  final absolute = MathHelper.abs(-42.5);

  print('2^3 = $squared');
  print('|-42.5| = $absolute');
}
