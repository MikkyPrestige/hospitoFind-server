export class JSDOM {
  constructor() {
    return {
      window: {
        document: {
          createElement: () => ({}),
          createTextNode: () => ({}),
          body: { appendChild: () => {} },
          head: { appendChild: () => {} },
          querySelectorAll: () => [],
          getElementsByTagName: () => [],
        },
        Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
      },
    };
  }
}
