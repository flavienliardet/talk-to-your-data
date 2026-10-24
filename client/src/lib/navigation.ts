/** Updates the URL to /chat/:id without triggering React Router navigation. */
export function softNavigateToChatId(
  chatId: string,
  chatHistoryEnabled: boolean,
): void {
  if (!chatHistoryEnabled) {
    // In ephemeral mode, don't change the URL - keep user on homepage
    return;
  }

  // Update URL to /chat/:id without triggering navigation
  window.history.replaceState({}, '', `/chat/${chatId}`);
}
