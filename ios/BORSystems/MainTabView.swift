import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var notifications: NotificationsStore

    @State private var selectedTab = 0
    @State private var drawerOpen = false
    @State private var drawerDestination: DrawerDestination?

    var body: some View {
        // Single source of truth for what this user may see. Each tab is gated
        // on the same capability layer the web nav uses, so the phone honours
        // the backend's permission model (admin all-true; supervisor most;
        // cleaner operations-only) and falls back to the role baseline when the
        // login payload didn't carry a permission map.
        let caps = auth.capabilities

        ZStack(alignment: .leading) {
            TabView(selection: $selectedTab) {
                // Alerts / Home — the operations landing screen. Operations is the
                // baseline module every role has, so this is always present.
                if caps.canSeeOperations {
                    HomeView()
                        .tabItem { Label("Alerts", systemImage: "bell.badge") }
                        .tag(0)
                }

                if caps.canSeeOperations {
                    MapView()
                        .tabItem { Label("Map", systemImage: "map") }
                        .tag(1)
                }

                // Dispatch — admins/supervisors get the org-wide send form; cleaners
                // get a read-only inbox of dispatches sent to them.
                if caps.canSeeOperations {
                    Group {
                        if caps.canSendDispatch {
                            DispatchSendView()
                        } else {
                            NavigationStack { MyDispatchesView() }
                        }
                    }
                    .tabItem { Label("Dispatch", systemImage: "paperplane") }
                    .tag(2)
                }

                // Schedule — everyone in operations. Cleaners see their own shifts
                // read-only; admins/supervisors see all + can edit (gated inside).
                if caps.canSeeOperations {
                    NavigationStack { ScheduleView() }
                        .tabItem { Label("Schedule", systemImage: "calendar") }
                        .tag(3)
                }

                // More — profile, notifications and app-level bits. The feature
                // tree lives in the sidebar now, matching the web app.
                MenuView()
                    .tabItem { Label("More", systemImage: "ellipsis.circle") }
                    .badge(notifications.unreadCount)
                    .tag(4)
            }

            // Floating menu chip — bottom-leading, clear of every screen's
            // header. Opens the discipline sidebar, like the web app's.
            if !drawerOpen {
                VStack {
                    Spacer()
                    HStack {
                        Button {
                            withAnimation(.easeOut(duration: 0.22)) { drawerOpen = true }
                        } label: {
                            Image(systemName: "sidebar.left")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 44)
                                .background(Color.accentColor, in: Circle())
                                .shadow(color: .black.opacity(0.25), radius: 6, y: 3)
                        }
                        .accessibilityLabel("Open menu")
                        .padding(.leading, 14)
                        .padding(.bottom, 88)
                        Spacer()
                    }
                }
                .allowsHitTesting(true)
            }

            // Scrim + drawer
            if drawerOpen {
                Color.black.opacity(0.35)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(.easeOut(duration: 0.2)) { drawerOpen = false }
                    }
                    .transition(.opacity)

                SideMenuView(
                    isOpen: $drawerOpen,
                    selectedTab: $selectedTab,
                    open: { dest in
                        withAnimation(.easeOut(duration: 0.2)) { drawerOpen = false }
                        // Small delay so the drawer finishes closing first.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            drawerDestination = dest
                        }
                    }
                )
                .frame(width: 300)
                .frame(maxHeight: .infinity)
                .background(.background)
                .transition(.move(edge: .leading))
                .shadow(color: .black.opacity(0.2), radius: 12, x: 4, y: 0)
            }
        }
        .gesture(
            DragGesture(minimumDistance: 25, coordinateSpace: .global)
                .onEnded { g in
                    // Edge swipe from the far left opens; swipe left closes.
                    if !drawerOpen && g.startLocation.x < 24 && g.translation.width > 60 {
                        withAnimation(.easeOut(duration: 0.22)) { drawerOpen = true }
                    } else if drawerOpen && g.translation.width < -60 {
                        withAnimation(.easeOut(duration: 0.2)) { drawerOpen = false }
                    }
                }
        )
        .fullScreenCover(item: $drawerDestination) { dest in
            NavigationStack {
                dest.view
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button {
                                drawerDestination = nil
                            } label: {
                                Label("Close", systemImage: "xmark")
                            }
                        }
                    }
            }
        }
        .task {
            // Keep the unread badge live while the user is signed in.
            notifications.startPolling()
        }
        .onDisappear { notifications.stopPolling() }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AuthStore())
        .environmentObject(NotificationsStore())
}
