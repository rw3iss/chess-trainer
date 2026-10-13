// Stack of open overlay layers. Escape (and similar "close the top thing"
// behaviour) only applies to the topmost layer, so a Menu inside a Modal
// closes the Menu first.

const stack: symbol[] = [];

/** Registers a layer; returns its release function. */
export function pushLayer(token: symbol): () => void {
	stack.push(token);
	return () => {
		const i = stack.lastIndexOf(token);
		if (i >= 0) stack.splice(i, 1);
	};
}

export function isTopLayer(token: symbol): boolean {
	return stack.length > 0 && stack[stack.length - 1] === token;
}
