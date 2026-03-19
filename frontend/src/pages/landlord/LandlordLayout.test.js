/**
 * Protected landlord routes: unauthenticated user is redirected to /landlord/login.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LandlordLayout from "../../components/landlord/LandlordLayout";

jest.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    isLandlordAuthenticated: false,
    loading: false,
    logout: jest.fn(),
  }),
}));

function PropertiesPlaceholder() {
  return <div data-testid="landlord-properties">Protected properties</div>;
}

function LoginPlaceholder() {
  return <div data-testid="landlord-login">Landlord login</div>;
}

describe("LandlordLayout protected routes", () => {
  it("redirects unauthenticated user to /landlord/login when visiting /landlord/properties", () => {
    render(
      <MemoryRouter initialEntries={["/landlord/properties"]}>
        <Routes>
          <Route path="/landlord" element={<LandlordLayout />}>
            <Route path="login" element={<LoginPlaceholder />} />
            <Route path="properties" element={<PropertiesPlaceholder />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("landlord-login")).toBeInTheDocument();
    expect(screen.queryByTestId("landlord-properties")).not.toBeInTheDocument();
  });
});
