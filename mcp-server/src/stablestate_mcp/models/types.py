from __future__ import annotations
from pydantic import BaseModel, Field


class Canvas(BaseModel):
    width: int = 960
    height: int = 600
    grid: int = 20


class Config(BaseModel):
    transition: str = "local"
    orthogonal: bool = False
    history: bool = False


class State(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float = 8
    h: float = 4
    parent: str | None = None
    children: list[str] = Field(default_factory=list)
    entry: str | None = None
    do: str | None = None
    exit: str | None = None
    color: str | None = None
    border_color: str | None = None
    text_color: str | None = None
    style: str | None = None
    round: int | None = None
    role: str | None = None
    line: int = 0


class PseudoState(BaseModel):
    type: str  # initial, final, choice, history, deephistory, fork, join
    id: str
    x: float
    y: float
    w: float | None = None
    h: float | None = None
    parent: str | None = None
    line: int = 0


class Group(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float
    h: float
    color: str | None = None
    border_color: str | None = None
    text_color: str | None = None
    role: str | None = None
    line: int = 0


class Transition(BaseModel):
    from_id: str = Field(alias="from")
    to_id: str = Field(alias="to")
    event: str | None = None
    guard: str | None = None
    action: str | None = None
    kind: str = "local"
    cyclic: bool = False
    default_target: str | None = None
    width: float | None = None
    style: str | None = None
    color: str | None = None
    line: int = 0

    model_config = {"populate_by_name": True}


class Note(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float = 8
    h: float = 2
    color: str | None = None
    text_color: str | None = None
    border_color: str | None = None
    role: str | None = None
    line: int = 0


class NoteConnection(BaseModel):
    note_id: str
    target_id: str
    line: int = 0


class ParseError(BaseModel):
    line: int
    msg: str


class Diagram(BaseModel):
    canvas: Canvas = Field(default_factory=Canvas)
    config: Config = Field(default_factory=Config)
    states: list[State] = Field(default_factory=list)
    pseudo_states: list[PseudoState] = Field(default_factory=list)
    groups: list[Group] = Field(default_factory=list)
    transitions: list[Transition] = Field(default_factory=list)
    notes: list[Note] = Field(default_factory=list)
    note_connections: list[NoteConnection] = Field(default_factory=list)
    errors: list[ParseError] = Field(default_factory=list)
