/**
 * Landlord login page: non-landlord role shows error and does not allow landlord portal access.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LandlordLoginPage from "./LandlordLoginPage";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

const mockLogin = jest.fn();
const mockLogout = jest.fn();
jest.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
    logout: mockLogout,
  }),
}));

jest.mock("../../api/auth", () => ({
  login: jest.fn(),
  getMe: jest.fn(),
}));

import { login as apiLogin, getMe } from "../../api/auth";

describe("LandlordLoginPage role guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows error and does not navigate when getMe returns non-landlord role", async () => {
    apiLogin.mockResolvedValue({ access_token: "token" });
    getMe.mockResolvedValue({ role: "admin" });

    render(
      <MemoryRouter>
        <LandlordLoginPage />
      </MemoryRouter>
    );

    // Labels are not wired with htmlFor/id; use placeholders (matches real DOM).
    await userEvent.type(screen.getByPlaceholderText("ihre@email.ch"), "admin@test.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password");
    screen.getByRole("button", { name: /anmelden/i }).click();

    await waitFor(() => {
      expect(screen.getByText(/nur für vermieter/i)).toBeInTheDocument();
    });
    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith("/landlord");
  });
});
