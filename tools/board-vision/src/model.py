"""Tile classifier: 4 conv stages + global average pool + linear. Input [N,3,40,40] RGB in [0,1]."""
from __future__ import annotations

import torch
from torch import nn

from common import CLASSES

WIDTHS = (32, 64, 128, 176)


def block(cin: int, cout: int) -> list[nn.Module]:
	return [nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True)]


class TileNet(nn.Module):
	def __init__(self, widths: tuple[int, ...] = WIDTHS, num_classes: int = len(CLASSES)) -> None:
		super().__init__()
		# Normalization lives inside the graph (the browser feeds raw [0,1] RGB).
		self.register_buffer("mean", torch.tensor([0.5, 0.5, 0.5]).view(1, 3, 1, 1))
		self.register_buffer("std", torch.tensor([0.25, 0.25, 0.25]).view(1, 3, 1, 1))
		w1, w2, w3, w4 = widths
		self.features = nn.Sequential(
			*block(3, w1), *block(w1, w1), nn.MaxPool2d(2),  # 20
			*block(w1, w2), *block(w2, w2), nn.MaxPool2d(2),  # 10
			*block(w2, w3), *block(w3, w3), nn.MaxPool2d(2),  # 5
			*block(w3, w4),
		)
		self.pool = nn.AdaptiveAvgPool2d(1)
		self.drop = nn.Dropout(0.2)
		self.fc = nn.Linear(w4, num_classes)

	def forward(self, x: torch.Tensor) -> torch.Tensor:
		x = (x - self.mean) / self.std
		x = self.pool(self.features(x)).flatten(1)
		return self.fc(self.drop(x))
