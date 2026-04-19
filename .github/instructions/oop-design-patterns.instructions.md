---
description: 'Best practices for applying Object-Oriented Programming (OOP) design patterns, including Gang of Four (GoF) patterns and SOLID principles, to ensure clean, maintainable, and scalable code.'
applyTo: '**/*.cpp, **/*.hpp, **/*.py, **/*.java, **/*.ts, **/*.js, **/*.cs'
---

# Design Patterns for Object-Oriented Programming for Clean Code

These instructions configure GitHub Copilot to prioritize Gang of Four (GoF) Design Patterns, SOLID principles, and clean Object-Oriented Programming (OOP) practices when generating or refactoring code.

## Core Architectural Philosophy

- **Program to an Interface, not an Implementation:** Always favor abstract classes or interfaces over concrete implementations. Use dependency injection to provide concrete instances.
- **Favor Object Composition over Class Inheritance:** Use composition to combine behaviors dynamically at runtime. Avoid deep inheritance trees.
- **Encapsulate What Varies:** Identify the aspects of the application that vary and separate them from what stays the same.
- **Loose Coupling:** Minimize direct dependencies between classes. Use Mediator, Observer, or abstract factories to keep components decoupled.

## Creational Patterns Guidelines

- **Abstract Factory:** Use when a system must be configured with one of multiple families of related products. Ensure clients only interact with the abstract factory and abstract product interfaces.
- **Factory Method:** Use when a class cannot anticipate the class of objects it must create. Defer instantiation to subclasses.
- **Builder:** Use when constructing a complex object requires a step-by-step process (e.g., `AppBuilder` pattern).
- **Singleton:** Use *only* when absolutely necessary to guarantee a single instance. Prefer Dependency Injection over strict Singletons.
- **Prototype:** Use to avoid building a class hierarchy of factories or when creating an object from scratch is more expensive than cloning.

## Structural Patterns Guidelines

- **Adapter:** Use to make incompatible interfaces work together. Prefer Object Adapters (using composition) over Class Adapters.
- **Bridge:** Use to separate an abstraction from its implementation so the two can vary independently (e.g., `IWebview` / `Webview`).
- **Composite:** Use to represent part-whole hierarchies uniformly via a common component interface.
- **Decorator:** Use to attach additional responsibilities to an object dynamically. Prefer this over subclassing for extending functionality.
- **Facade:** Use to provide a simple, unified interface to a complex subsystem.
- **Proxy:** Use to provide a surrogate or placeholder for another object to control access (e.g., lazy loading, access control).

## Behavioral Patterns Guidelines

- **Strategy:** Use to define a family of algorithms, encapsulate each one, and make them interchangeable. Eliminates complex `switch`/`if-else` chains.
- **Observer:** Use to define a one-to-many dependency where a change in one object automatically notifies others. Keep subjects and observers loosely coupled.
- **Command:** Use to encapsulate a request as an object. Essential for implementing undo/redo, queues, or logging.
- **State:** Use when an object's behavior depends heavily on its internal state and must change at runtime.
- **Template Method:** Use to define the skeleton of an algorithm in a base class, deferring specific steps to subclasses.
- **Chain of Responsibility:** Use to pass a request along a chain of potential handlers until one handles it.
- **Mediator:** Use to centralize complex communications between a set of objects, keeping them from referring to each other explicitly.
- **Iterator:** Use to provide a standard way to sequentially access elements of an aggregate object.
- **Visitor:** Use to define a new operation on an object structure without changing the classes of the elements.

## Code Generation Rules

- **Pattern Recognition:** When prompted to solve a problem that maps to a GoF pattern, explicitly mention the pattern in comments.
- **Interface First:** Generate the interface or abstract base class *before* generating concrete implementations.
- **Immutability & Encapsulation:** Make fields `private` by default. Provide getters/setters only when necessary.
- **Naming Conventions:** Use pattern names in class names where it aids understanding (e.g., `TaxCalculationStrategy`, `WidgetFactory`).
- **Avoid God Classes:** Break large, complex classes into smaller, focused classes.
- **Single Responsibility Principle:** Ensure each class has only one reason to change.
- **Open/Closed Principle:** Design classes to be open for extension but closed for modification.
- **Liskov Substitution Principle:** Ensure subclasses can be substituted for their base classes without altering program correctness.
- **Interface Segregation Principle:** Prefer many specific interfaces over a single general-purpose interface.
- **Dependency Inversion Principle:** Depend on abstractions, not concretions. High-level modules should not depend on low-level modules.
- **Use Design Patterns Judiciously:** Apply patterns only when they solve a real problem. Avoid over-engineering.
- **Testability:** Ensure generated code is testable. Use patterns that facilitate unit testing (e.g., Dependency Injection for easier mocking).

## Logging and Error Handling

- Fail safe, loud, clear, and early.
- Avoid silent failures; ensure errors are logged with sufficient context.
- Use custom exceptions where appropriate for meaningful error messages.
- Avoid using exception blocks to control normal program flow.
- Use info, debug, warning, error, and critical log levels appropriately.

## Documentation

- Use comments to explain why a pattern was chosen and how it is applied.
- Maintain a high-level architectural overview that explains how components and patterns fit together.
- Never create redundant documentation files with duplicate content.
- Keep documentation concise, clear, and focused on the most important aspects.
