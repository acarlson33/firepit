import { useEffect, useState } from "react";

/**
 * Hook to manage global search dialog with Ctrl/Cmd+K keyboard shortcut
 */
export function useGlobalSearch() {
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Check for Ctrl+K (Windows/Linux) or Cmd+K (Mac)
			if ((event.ctrlKey || event.metaKey) && event.key === "k") {
				event.preventDefault();
				setIsOpen((prev) => !prev);
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	return {
		isOpen,
		setIsOpen,
		open: () => setIsOpen(true),
		close: () => setIsOpen(false),
		toggle: () => setIsOpen((prev) => !prev),
	};
}
