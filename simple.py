# ============================================================
# simple.py — Test file for Codilizer
# Set breakpoints on executable lines marked with "# <-- BREAKPOINT"
# ============================================================

# --- 1. Addition ---
def add_numbers(a, b):
    total = a + b
    return total  # <-- BREAKPOINT: see a, b, total in the stack frame


# --- 2. Palindrome Check (uses a list for heap visualization) ---
def is_palindrome(text):
    clean_text = text.lower().replace(" ", "")
    chars = list(clean_text)          # creates a list on the heap
    reversed_chars = chars[::-1]      # creates another list
    result = chars == reversed_chars  # <-- BREAKPOINT: edit chars before comparison
    return result


# --- 3. Factorial (loop — watch variables change as you step) ---
def find_factorial(n):
    result = 1
    for i in range(2, n + 1):
        result *= i  # <-- BREAKPOINT: step with F10 to watch result grow each iteration
    return result


# --- 4. Celsius to Fahrenheit ---
def celsius_to_fahrenheit(celsius):
    fahrenheit = (celsius * 9 / 5) + 32
    return fahrenheit  # <-- BREAKPOINT: see celsius and fahrenheit side by side


# --- 5. Even/Odd Check ---
def is_even(number):
    return number % 2 == 0  # <-- BREAKPOINT: see number in the frame


# --- 6. List & Dict demo (best for heap + reference arrows) ---
def process_data(data, info):
    subset = data[:3]
    info["average"] = sum(info["scores"]) / len(info["scores"])
    return data, info, subset  # <-- BREAKPOINT: see 3 heap cards with reference arrows


# ============================================================
# --- Run everything ---
# ============================================================
if __name__ == "__main__":

    data = [3, 1, 4, 1, 5, 9]
    info = {"status": "Pending", "age": 30, "scores": [95, 87, 92]}

    # 1. Addition
    num1, num2 = 12, 8
    sum_result = add_numbers(num1, num2)
    print(f"The sum of {num1} and {num2} is {sum_result}")

    # 2. Palindrome
    word = "Racecar"
    if is_palindrome(word):
        print(f"'{word}' is a palindrome.")
    else:
        print(f"'{word}' is not a palindrome.")

    # 3. Factorial
    fact_num = 5
    factorial_result = find_factorial(fact_num)
    print(f"The factorial of {fact_num} is {factorial_result}")

    # 4. Temperature
    temp_c = 25
    temp_f = celsius_to_fahrenheit(temp_c)
    print(f"{temp_c}°C is equal to {temp_f}°F")

    # 5. Even/Odd
    test_value = 14
    if is_even(test_value):
        print(f"{test_value} is an even number.")
    else:
        print(f"{test_value} is an odd number.")

    # 6. List & Dict demo
    data, info, subset = process_data(data, info)
    print(f"Data: {data}, Subset: {subset}")  # <-- BREAKPOINT: see all heap objects at module level
    print(f"Info: {info}")
