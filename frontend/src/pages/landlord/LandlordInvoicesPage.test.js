/**
 * Landlord invoices page: list, empty state, error state.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import LandlordInvoicesPage from "./LandlordInvoicesPage";

jest.mock("../../api/landlordApi", () => ({
  fetchLandlordInvoices: jest.fn(),
}));

import { fetchLandlordInvoices } from "../../api/landlordApi";

describe("LandlordInvoicesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders list of invoices when API returns data", async () => {
    fetchLandlordInvoices.mockResolvedValue([
      {
        id: 1,
        invoice_number: "INV-001",
        amount: 1500,
        due_date: "2024-02-01",
        status: "unpaid",
        unit_title: "Wohnung 1",
        property_title: "Property A",
        tenant_name: "Max Mustermann",
        tenant_email: "max@example.com",
      },
    ]);

    render(<LandlordInvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText("INV-001")).toBeInTheDocument();
      expect(screen.getByText("Property A")).toBeInTheDocument();
      expect(screen.getByText("Wohnung 1")).toBeInTheDocument();
      expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    });
    expect(screen.getByText("Rechnungen")).toBeInTheDocument();
  });

  it("renders empty state when API returns empty list", async () => {
    fetchLandlordInvoices.mockResolvedValue([]);

    render(<LandlordInvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/keine rechnungen vorhanden/i)).toBeInTheDocument();
    });
  });

  it("renders error state when API fails", async () => {
    fetchLandlordInvoices.mockRejectedValue(new Error("Network error"));

    render(<LandlordInvoicesPage />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});
